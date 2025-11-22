import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Loader2, Zap, ZapOff, Grid, ZoomIn, ZoomOut } from 'lucide-react'; 
import { TranslateFn } from '../types';
import { createPhotoStrip } from '../utils/imageProcessing';
import { isIOS, supportsHaptics, supportsImageCapture } from '../utils/deviceDetection';

interface CameraCaptureProps {
  onCapture: (imageSrc: string) => void;
  onClose: () => void;
  t: TranslateFn;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose, t }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Hardware References
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const imageCaptureRef = useRef<any>(null); // Native ImageCapture API
  
  const [error, setError] = useState<string>('');
  const [flash, setFlash] = useState(false); // Visual UI flash effect
  const [torch, setTorch] = useState(false); // Physical flashlight state
  const [supportsTorch, setSupportsTorch] = useState(false); // Hardware capability check
  const [showGrid, setShowGrid] = useState(false);
  const [usingFrontCamera, setUsingFrontCamera] = useState(true); 
  const [isLoading, setIsLoading] = useState(true);
  
  // Capabilities
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsZoom, setSupportsZoom] = useState(false);

  const [mode, setMode] = useState<'photo' | 'video' | 'booth'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Photobooth State
  const [countdown, setCountdown] = useState<number | null>(null);
  const [processingStrip, setProcessingStrip] = useState(false);

  const startCamera = useCallback(async (useFront: boolean) => {
    setIsLoading(true);
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      // iOS Safari requires specific resolution constraints to trigger high-quality video
      // Android/Chrome can use ImageCapture to get high-res photos even from 1080p stream
      const constraints: MediaStreamConstraints = {
        audio: mode === 'video',
        video: {
          facingMode: useFront ? 'user' : { exact: 'environment' },
          // Request 4K ideal to force highest resolution available
          width: { ideal: 4096 },
          height: { ideal: 2160 },
          // Prefer native mobile aspect ratio
          aspectRatio: { ideal: window.innerHeight / window.innerWidth }
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Setup Track & Capabilities
      const videoTrack = mediaStream.getVideoTracks()[0];
      trackRef.current = videoTrack;

      // Detect Capabilities (Chrome/Android)
      const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      
      // Zoom Support
      // @ts-ignore
      if (capabilities.zoom) {
          setSupportsZoom(true);
          // @ts-ignore
          setMaxZoom(capabilities.zoom.max || 3);
          setZoom(1);
      } else {
          setSupportsZoom(false);
      }

      // Torch/Flash Support Check
      // @ts-ignore
      if (capabilities.torch) {
          setSupportsTorch(true);
      } else {
          // Fallback check for iOS/Safari constraints
          try {
             const settings = videoTrack.getSettings();
             // @ts-ignore
             // Some browsers report torch in settings but not capabilities
             setSupportsTorch(!!settings.torch || 'torch' in settings); 
          } catch(e) {
             setSupportsTorch(false);
          }
      }
      // Reset torch state on camera switch
      setTorch(false);

      // Setup Native Image Capture (Android/Desktop Chrome)
      if (supportsImageCapture()) {
          // @ts-ignore
          imageCaptureRef.current = new ImageCapture(videoTrack);
      } else {
          imageCaptureRef.current = null;
      }

      setUsingFrontCamera(useFront);
      setIsLoading(false);
      setError('');
    } catch (err: any) {
      console.error('Camera error:', err);
      // Fallback: If exact environment fails (common on some devices), try generic
      if (err?.constraint === 'facingMode' && !useFront) {
          try {
               const fallbackConstraints = { video: { facingMode: 'environment' }, audio: false };
               const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
               streamRef.current = fallbackStream;
               if (videoRef.current) videoRef.current.srcObject = fallbackStream;
               trackRef.current = fallbackStream.getVideoTracks()[0];
               setUsingFrontCamera(false);
               setIsLoading(false);
               return;
          } catch (e) {}
      }
      setIsLoading(false);
      setError(t('cameraError'));
    }
  }, [t, mode]);

  useEffect(() => {
    startCamera(usingFrontCamera);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode]); // Restart camera if mode changes (audio permissions)

  const handleZoom = async (newZoom: number) => {
      setZoom(newZoom);
      if (trackRef.current && supportsZoom) {
          try {
              await trackRef.current.applyConstraints({
                  // @ts-ignore
                  advanced: [{ zoom: newZoom }]
              });
          } catch (e) {
              console.error("Zoom failed", e);
          }
      }
  };

  const toggleTorch = async () => {
      if (!trackRef.current) return;
      
      const newTorchState = !torch;
      
      try {
          await trackRef.current.applyConstraints({
              // @ts-ignore
              advanced: [{ torch: newTorchState }]
          });
          setTorch(newTorchState);
      } catch (err) {
          console.error("Torch toggle failed", err);
          // Sometimes applying constraints fails if other constraints conflict
          // Try applying ONLY torch constraint
          try {
             // @ts-ignore
             await trackRef.current.applyConstraints({ advanced: [{ torch: newTorchState }] });
             setTorch(newTorchState);
          } catch(retryErr) {
             console.error("Retry torch failed", retryErr);
          }
      }
  };

  const triggerHaptics = () => {
      if (supportsHaptics()) {
          navigator.vibrate(50);
      }
  };

  const takePhoto = async (): Promise<string | null> => {
    triggerHaptics();
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    try {
        // METHOD 1: Native ImageCapture (High Res - Android)
        if (imageCaptureRef.current) {
            try {
                // If torch is on, ensure it stays on during capture or use red-eye reduction if supported
                const blob = await imageCaptureRef.current.takePhoto();
                const url = URL.createObjectURL(blob);
                return url;
            } catch (e) {
                console.warn("ImageCapture failed, falling back to canvas", e);
            }
        }

        // METHOD 2: Canvas Fallback (iOS / unsupported browsers)
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            // Capture at actual video resolution
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (usingFrontCamera) {
                    // Mirror front camera
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(video, 0, 0);
                ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
                return canvas.toDataURL('image/jpeg', 0.95);
            }
        }
    } catch (e) {
        console.error("Capture failed", e);
    }
    return null;
  };

  const handleCapture = async () => {
      const img = await takePhoto();
      if (img) {
          // Turn off torch after capture if it was on (optional UX choice, often good to save battery)
          if (torch) toggleTorch(); 
          onCapture(img);
      }
  };

  // --- Video Logic ---
  const toggleRecording = () => {
      if (isRecording) {
          stopRecording();
      } else {
          startRecording();
      }
  };

  const startRecording = () => {
      if (!streamRef.current) return;
      triggerHaptics();
      recordedChunksRef.current = [];
      
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
          ? 'video/webm;codecs=vp9,opus' 
          : 'video/mp4'; // Safari fallback

      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          onCapture(url);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
  };

  const stopRecording = () => {
      triggerHaptics();
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      if (torch) toggleTorch(); // Auto-off torch after video
  };

  // --- Photobooth Logic ---
  const runPhotobooth = async () => {
      if (isRecording) return;
      setIsRecording(true);
      
      const images: string[] = [];
      for (let i = 0; i < 3; i++) {
          for (let c = 3; c > 0; c--) {
              setCountdown(c);
              await new Promise(r => setTimeout(r, 1000));
          }
          setCountdown(null);
          const img = await takePhoto();
          if (img) images.push(img);
          
          if (i < 2) await new Promise(r => setTimeout(r, 1000));
      }

      setProcessingStrip(true);
      const strip = await createPhotoStrip(images);
      onCapture(strip);
      setProcessingStrip(false);
      setIsRecording(false);
      if (torch) toggleTorch(); // Auto-off torch after booth
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col touch-none select-none">
      {/* Torch Overlay - Visual indicator if hardware torch fails/isn't supported but state is on */}
      {(!supportsTorch && torch) && <div className="absolute inset-0 bg-white/20 pointer-events-none z-10 mix-blend-overlay" />}

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent">
         <div className="text-white font-bold flex items-center gap-4">
            {/* Torch Toggle - Only show if backend supports it or we use software fallback */}
            <button 
                onClick={supportsTorch ? toggleTorch : () => setTorch(!torch)} 
                className={`p-2 rounded-full backdrop-blur-md transition-all ${torch ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-black/20 text-white'}`}
            >
                {torch ? <Zap size={20} fill="currentColor" /> : <ZapOff size={20} />}
            </button>
             <button onClick={() => setShowGrid(!showGrid)} className={`p-2 rounded-full backdrop-blur-md transition-all ${showGrid ? 'bg-white text-black' : 'bg-black/20 text-white'}`}>
                <Grid size={20} />
            </button>

            {isRecording && mode === 'video' && (
                <span className="bg-red-500 px-3 py-1 rounded-full text-xs font-bold animate-pulse shadow-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full" />
                    {new Date(recordingTime * 1000).toISOString().substr(14, 5)}
                </span>
            )}
         </div>
         <button onClick={onClose} className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors">
           <X size={24} />
         </button>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
          {isLoading && <Loader2 className="text-white animate-spin w-12 h-12" />}
          
          {error ? (
             <div className="text-white text-center p-6">
                 <p className="mb-4">{error}</p>
                 <button onClick={() => startCamera(usingFrontCamera)} className="bg-white text-black px-6 py-2 rounded-full font-bold">Retry</button>
             </div>
          ) : (
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-transform duration-500 ${usingFrontCamera ? 'scale-x-[-1]' : ''}`}
                // On iOS, full screen video is critical
                style={{ maxHeight: '100dvh', maxWidth: '100vw' }} 
            />
          )}
          
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Flash Animation */}
          <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-100 z-30 ${flash ? 'opacity-100' : 'opacity-0'}`} />

          {/* Grid Lines */}
          {showGrid && (
              <div className="absolute inset-0 z-10 pointer-events-none opacity-50">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white shadow-sm" />
                  <div className="absolute right-1/3 top-0 bottom-0 w-px bg-white shadow-sm" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white shadow-sm" />
                  <div className="absolute bottom-1/3 left-0 right-0 h-px bg-white shadow-sm" />
              </div>
          )}

          {/* Countdown */}
          {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center z-40">
                  <span className="text-[150px] font-black text-white drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] animate-bounce">{countdown}</span>
              </div>
          )}

          {/* Loading Overlay */}
          {processingStrip && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                  <Loader2 className="text-white w-16 h-16 animate-spin mb-4" />
                  <p className="text-white font-bold tracking-widest">PROCESSING</p>
              </div>
          )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-12 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-20">
        
        {/* Zoom Slider (Only if supported) */}
        {supportsZoom && maxZoom > 1 && (
            <div className="flex items-center justify-center gap-4 mb-6 px-8 opacity-0 hover:opacity-100 transition-opacity duration-300">
                <ZoomOut size={16} className="text-white/70" />
                <input 
                    type="range" 
                    min="1" 
                    max={maxZoom} 
                    step="0.1" 
                    value={zoom} 
                    onChange={(e) => handleZoom(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <ZoomIn size={16} className="text-white/70" />
            </div>
        )}

        {/* Mode Selector */}
        <div className="flex justify-center gap-8 mb-8">
             {['photo', 'video', 'booth'].map((m) => (
                 <button 
                    key={m}
                    onClick={() => setMode(m as any)}
                    className={`text-sm font-bold uppercase tracking-widest transition-all duration-300 ${
                        mode === m ? 'text-yellow-400 scale-110 drop-shadow-glow' : 'text-white/50 hover:text-white'
                    }`}
                 >
                     {m}
                 </button>
             ))}
        </div>

        <div className="flex items-center justify-around px-8">
            <div className="w-12" /> {/* Spacer */}
            
            {/* Main Shutter Button */}
            <button 
                onClick={mode === 'video' ? toggleRecording : mode === 'booth' ? runPhotobooth : handleCapture}
                disabled={isRecording && mode === 'booth'}
                className={`
                    relative w-20 h-20 rounded-full border-[5px] flex items-center justify-center transition-all duration-200 shadow-2xl
                    ${mode === 'video' 
                        ? (isRecording ? 'border-red-500 scale-110' : 'border-white hover:scale-105') 
                        : (isRecording ? 'border-indigo-500' : 'border-white hover:scale-105')
                    }
                `}
            >
                <div className={`
                    rounded-full transition-all duration-200
                    ${mode === 'video' 
                        ? (isRecording ? 'w-8 h-8 bg-red-500 rounded-md' : 'w-16 h-16 bg-red-500') 
                        : (mode === 'booth' ? 'w-16 h-16 bg-indigo-500' : 'w-18 h-18 bg-white')
                    }
                `} />
            </button>

            <button 
                onClick={() => startCamera(!usingFrontCamera)}
                className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-md transition-transform active:rotate-180 duration-500"
            >
                <RotateCcw size={24} />
            </button>
        </div>
      </div>
    </div>
  );
};