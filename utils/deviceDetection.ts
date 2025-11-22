// Device detection utilities
export const isMobileDevice = (): boolean => {
  // Check for touch support and screen size
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  
  // Check user agent for mobile devices
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  return hasTouch && (isSmallScreen || isMobileUA);
};

export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

export const isAndroid = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
};

export const supportsHaptics = (): boolean => {
    return typeof navigator !== 'undefined' && !!navigator.vibrate;
};

export const supportsImageCapture = (): boolean => {
    return typeof window !== 'undefined' && 'ImageCapture' in window;
};