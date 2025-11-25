import { WatermarkPosition } from '../types';
// @ts-ignore - EXIF library has no TypeScript definitions
import EXIF from 'exif-js';

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

// NEW: Helper to extract GPS from File
export const getGPSFromImage = (file: File): Promise<{ lat: number, lng: number } | null> => {
    return new Promise((resolve) => {
        try {
            EXIF.getData(file as any, function(this: any) {
                const lat = EXIF.getTag(this, "GPSLatitude");
                const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                const lng = EXIF.getTag(this, "GPSLongitude");
                const lngRef = EXIF.getTag(this, "GPSLongitudeRef");

                if (lat && latRef && lng && lngRef) {
                    const latitude = convertDMSToDD(lat[0], lat[1], lat[2], latRef);
                    const longitude = convertDMSToDD(lng[0], lng[1], lng[2], lngRef);
                    resolve({ lat: latitude, lng: longitude });
                } else {
                    resolve(null);
                }
            });
        } catch (e) {
            console.warn("EXIF extraction failed", e);
            resolve(null);
        }
    });
};

// NEW: Helper to get EXIF Orientation
export const getExifOrientation = (file: File): Promise<number> => {
    return new Promise((resolve) => {
        try {
            EXIF.getData(file as any, function(this: any) {
                const orientation = EXIF.getTag(this, "Orientation");
                resolve(orientation || 1);
            });
        } catch (e) {
            resolve(1);
        }
    });
};

// Helper to convert DMS (Degrees, Minutes, Seconds) to Decimal Degrees
const convertDMSToDD = (degrees: number, minutes: number, seconds: number, direction: string): number => {
    let dd = degrees + minutes / 60 + seconds / (60 * 60);
    if (direction === "S" || direction === "W") {
        dd = dd * -1;
    }
    return dd;
};

export const applyWatermark = async (
  imageSrc: string, 
  text: string | null, 
  logoUrl: string | null,
  opacity: number = 0.85,
  sizePercent: number = 20,
  position: WatermarkPosition = 'bottom-right',
  offXPercent: number = 2,
  offYPercent: number = 2
): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(imageSrc);
                return;
            }
            
            // Draw Base Image
            ctx.drawImage(img, 0, 0);
            
            if (logoUrl) {
                const logo = new Image();
                logo.src = logoUrl;
                await new Promise((r) => { 
                    logo.onload = () => r(null); 
                    logo.onerror = () => r(null); 
                });
                
                const scalePercent = sizePercent / 100;
                const maxWidth = img.width * scalePercent;
                
                const ratio = maxWidth / logo.width;
                const logoW = logo.width * ratio;
                const logoH = logo.height * ratio;
                
                const paddingX = img.width * (offXPercent / 100);
                const paddingY = img.height * (offYPercent / 100);

                let dx = 0;
                let dy = 0;

                switch(position) {
                    case 'top-left': dx = paddingX; dy = paddingY; break;
                    case 'top-right': dx = img.width - logoW - paddingX; dy = paddingY; break;
                    case 'bottom-left': dx = paddingX; dy = img.height - logoH - paddingY; break;
                    case 'bottom-right': dx = img.width - logoW - paddingX; dy = img.height - logoH - paddingY; break;
                    case 'center': dx = (img.width / 2) - (logoW / 2) + paddingX; dy = (img.height / 2) - (logoH / 2) + paddingY; break;
                }

                ctx.globalAlpha = opacity;
                ctx.drawImage(logo, dx, dy, logoW, logoH);
                ctx.globalAlpha = 1.0;

            } else if (text) {
                const fontSize = Math.max(24, img.width * (sizePercent / 300));
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;

                const paddingX = img.width * (offXPercent / 100);
                const paddingY = img.height * (offYPercent / 100);

                let x = 0;
                let y = 0;

                switch(position) {
                    case 'top-left': ctx.textAlign = 'left'; ctx.textBaseline = 'top'; x = paddingX; y = paddingY; break;
                    case 'top-right': ctx.textAlign = 'right'; ctx.textBaseline = 'top'; x = img.width - paddingX; y = paddingY; break;
                    case 'bottom-left': ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; x = paddingX; y = img.height - paddingY; break;
                    case 'bottom-right': ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; x = img.width - paddingX; y = img.height - paddingY; break;
                    case 'center': ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; x = (img.width / 2) + paddingX; y = (img.height / 2) + paddingY; break;
                }

                ctx.fillText(text.toUpperCase(), x, y);
            }
            
            resolve(canvas.toDataURL('image/jpeg', 0.95)); // Increased quality
        };
        img.onerror = () => resolve(imageSrc);
        img.src = imageSrc;
    });
};

export const createPhotoStrip = async (images: string[], footerText: string = "SnapifY"): Promise<string> => {
    if (images.length === 0) return '';

    try {
        const loadedImages = await Promise.all(images.map(src => loadImage(src)));
        const baseWidth = loadedImages[0].width;
        const baseHeight = loadedImages[0].height;
        
        // Strip Config
        const padding = Math.floor(baseWidth * 0.05); // 5% padding
        const bottomBannerHeight = Math.floor(baseHeight * 0.25); // Larger footer for text
        
        const canvasWidth = baseWidth + (padding * 2);
        const canvasHeight = (baseHeight * loadedImages.length) + (padding * (loadedImages.length + 1)) + bottomBannerHeight;
        
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) throw new Error('Context not available');

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw Images
        loadedImages.forEach((img, index) => {
            const y = padding + (index * (baseHeight + padding));
            ctx.drawImage(img, padding, y, baseWidth, baseHeight);
        });

        // Draw Footer
        const footerY = canvasHeight - bottomBannerHeight;
        ctx.fillStyle = '#1a1a1a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const dateStr = new Date().toLocaleDateString();
        const fontSize = Math.floor(baseWidth * 0.08); // Larger font
        
        // Brand
        ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
        ctx.fillText(footerText.toUpperCase(), canvasWidth / 2, footerY + (bottomBannerHeight * 0.35));
        
        // Date
        ctx.font = `500 ${fontSize * 0.5}px "Inter", sans-serif`;
        ctx.fillStyle = '#666666';
        ctx.fillText(dateStr, canvasWidth / 2, footerY + (bottomBannerHeight * 0.7));

        return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
        console.error("Error generating photostrip", e);
        return images[0]; // Fallback
    }
};