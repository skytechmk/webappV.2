import React, { useRef, useState, useCallback } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { processImage } from '../utils/imageProcessing';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        // Process image without EXIF correction (preview modal handles orientation)
        const processedImage = await processImage(file, 1920, 1080, false);
        onCapture(processedImage);
      } catch (error) {
        console.error('Error processing image:', error);
        setError('Failed to process image. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-start items-center z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-black/20 text-white backdrop-blur-sm hover:bg-black/40 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {error ? (
          <div className="text-white text-center p-6 max-w-sm">
            <p className="mb-4 text-red-400">{error}</p>
          </div>
        ) : (
          <>
            <div className="text-white text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Take a Photo</h2>
              <p className="text-white/70">Use your device's camera to capture a new image</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-6 rounded-full border-4 border-white transition-transform active:scale-95 bg-white/10 hover:bg-white/20"
            >
              <Upload className="w-12 h-12 text-white" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
              capture="environment"
            />

            <p className="text-white/50 text-sm mt-4 text-center">
              Or select an existing photo from your gallery
            </p>

            <button
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => handleFileUpload(e as any);
                input.click();
              }}
              className="mt-4 px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <ImageIcon className="w-5 h-5" />
              Choose from Gallery
            </button>
          </>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
};