import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Images, Loader2, Zap, ZapOff } from 'lucide-react';
import { TranslateFn } from '../types';
import { createPhotoStrip } from '../utils/imageProcessing';

interface CameraCaptureProps {
  onCapture: (imageSrc: string) => void;
  onClose: () => void;
  t: TranslateFn;
}

const FILTERS = [
  { id: 'none', name: 'Normal', css: 'none' },
  { id: 'grayscale', name: 'B&W', css: 'grayscale(1)' },
  { id: 'sepia', name: 'Vintage', css: 'sepia(0.8) contrast(1.2)' },
  { id: 'warm', name: 'Warm', css: 'sepia(0.3) saturate(1.4)' },
  { id: 'cool', name: 'Cool', css: 'saturate(0.5) hue-rotate(180deg)' },
  { id: 'invert', name: 'Negative', css: 'invert(1)' },
];

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose, t }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [flash, setFlash] = useState(false);
  const [usingFrontCamera, setUsingFrontCamera] = useState(true); // Default to front for selfies
  
  // Modes: 'photo', 'video', 'booth'
  const [mode, setMode] = useState<'photo' | 'video' | 'booth'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  
  // Photobooth State
  const [countdown, setCountdown] = useState<number | null>(null);
  const [processingStrip, setProcessingStrip] = useState(false);

  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup helper for Object URLs
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
      return () => {
          objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      };
  }, []);

  const startCamera = useCallback(async (useFrontCamera = false) => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: { 
          facingMode: useFrontCamera ? 'user' : 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: mode === 'video'
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setUsingFrontCamera(useFrontCamera);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.playsInline = true;
      }
      setError('');
    } catch (err) {
      console.error('Camera error:', err);
      setError(t('cameraError'));
    }
  }, [t, mode]); // Removed stream dependency to prevent loops, handle cleanup inside

  const switchCamera = () => {
    startCamera(!usingFrontCamera);
  };

  useEffect(() => {
    startCamera(true);
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty dependency array for init

  // Helper to capture single frame with filter
  const captureFrame = (): string | null => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Match canvas size to video stream resolution
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Apply Filter
        if (selectedFilter.id !== 'none') {
            ctx.filter = selectedFilter.css;
        }
        
        // Mirror if front camera
        if (usingFrontCamera) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Reset context
        ctx.filter = 'none';
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        return canvas.toDataURL('image/jpeg', 0.90);
      }
    }
    return null;
  };

  const takePhoto = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    const img = captureFrame();
    if (img) onCapture(img);
  };

  // --- Photobooth Logic ---
  const runPhotoboothSequence = async () => {
      if (isRecording) return;
      setIsRecording(true);
      
      const tempImages: string[] = [];
      
      for (let i = 0; i < 3; i++) {
          // 3 Second Countdown
          for (let c = 3; c > 0; c--) {
              setCountdown(c);
              await new Promise(r => setTimeout(r, 1000));
          }
          setCountdown(null);
          
          // Snap
          setFlash(true);
          const img = captureFrame();
          if (img) tempImages.push(img);
          setTimeout(() => setFlash(false), 150);
          
          // Pause between shots
          if (i < 2) await new Promise(r => setTimeout(r, 1000));
      }

      setProcessingStrip(true);
      const finalStrip = await createPhotoStrip(tempImages);
      onCapture(finalStrip);
      setIsRecording(false);
      setProcessingStrip(false);
  };

  // --- Video Logic ---
  const startRecording = async () => {
    if (!stream) return;
    recordedChunksRef.current = [];
    
    try {
      // Prefer vp9/opus, fallback to default if not supported
      const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
        ? { mimeType: 'video/webm;codecs=vp9,opus' } 
        : undefined;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url); // Track for cleanup
        onCapture(url);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(p => p + 1);
      }, 1000);
      
    } catch (e) {
      console.error(e);
      setError("Recording failed. Try refreshing.");
    }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
      }
      setIsRecording(false);
      setRecordingTime(0);
  };

  const handleMainButton = () => {
      if (mode === 'photo') takePhoto();
      else if (mode === 'video') {
          if (isRecording) stopRecording();
          else startRecording();
      }
      else if (mode === 'booth') runPhotoboothSequence();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-safe-top flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent">
         <div className="text-white font-bold flex items-center gap-2">
            {isRecording && mode === 'video' && (
                <span className="bg-red-500 px-2 py-0.5 rounded text-xs animate-pulse">REC {recordingTime}s</span>
            )}
            {mode === 'booth' && (
                <span className="bg-indigo-500 px-2 py-0.5 rounded text-xs flex items-center gap-1 shadow-lg">
                    <Images size={12} /> PHOTOBOOTH
                </span>
            )}
         </div>
         <button onClick={onClose} className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors">
           <X size={24} />
         </button>
      </div>

      {/* Flash */}
      <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 z-30 ${flash ? 'opacity-100' : 'opacity-0'}`} />
      
      {/* Countdown */}
      {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
              <span className="text-9xl font-black text-white drop-shadow-2xl animate-ping">{countdown}</span>
          </div>
      )}
      
      {/* Processing */}
      {processingStrip && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/80 backdrop-blur-sm">
              <Loader2 className="text-indigo-500 w-16 h-16 animate-spin mb-4" />
              <p className="text-white font-bold">Creating Photo Strip...</p>
          </div>
      )}

      {/* Video Viewport - using object-cover to fill screen without black bars */}
      <div className="absolute inset-0 z-0 bg-black">
        {error ? (
          <div className="flex h-full items-center justify-center text-white p-6 text-center">
            <div>
                <p className="mb-4 text-lg">{error}</p>
                <button onClick={() => startCamera(usingFrontCamera)} className="px-6 py-3 bg-indigo-600 rounded-xl font-bold">
                    {t('retry')}
                </button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-transform duration-300 ${usingFrontCamera ? 'scale-x-[-1]' : ''}`}
            style={{ filter: mode !== 'video' ? selectedFilter.css : 'none' }}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Filter Strip */}
      {mode !== 'video' && !error && (
          <div className="absolute bottom-36 left-0 right-0 h-20 z-30 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-4 px-6 h-full">
                  {FILTERS.map(f => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFilter(f)}
                        className={`flex-shrink-0 w-14 h-14 rounded-full overflow-hidden border-2 transition-all relative group shadow-lg ${selectedFilter.id === f.id ? 'border-indigo-500 scale-110 ring-2 ring-indigo-500/50' : 'border-white/60'}`}
                      >
                          <div className="w-full h-full bg-gray-400" style={{ filter: f.css }}>
                              <div className="w-full h-full bg-gradient-to-br from-white/20 to-black/20" />
                          </div>
                          <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 text-white text-center py-0.5 backdrop-blur-sm">
                              {f.name}
                          </span>
                      </button>
                  ))}
              </div>
          </div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pb-safe-bottom pt-12 z-20">
        
        {/* Mode Switcher */}
        <div className="flex justify-center gap-8 mb-6 text-sm font-bold uppercase tracking-widest text-shadow-sm">
            <button onClick={() => setMode('photo')} className={`transition-all ${mode === 'photo' ? 'text-yellow-400 scale-110' : 'text-white/60 hover:text-white'}`}>Photo</button>
            <button onClick={() => setMode('video')} className={`transition-all ${mode === 'video' ? 'text-yellow-400 scale-110' : 'text-white/60 hover:text-white'}`}>Video</button>
            <button onClick={() => setMode('booth')} className={`transition-all ${mode === 'booth' ? 'text-indigo-400 scale-110' : 'text-white/60 hover:text-white'}`}>Booth</button>
        </div>

        <div className="flex items-center justify-around px-10 pb-8">
            {/* Rotate */}
            <button 
                onClick={switchCamera}
                className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors backdrop-blur-md"
            >
                <RotateCcw size={24} />
            </button>
            
            {/* Shutter */}
            <button 
                onClick={handleMainButton}
                disabled={isRecording && mode === 'booth'}
                className={`w-20 h-20 rounded-full border-4 flex items-center justify-center relative transition-all shadow-xl ${
                    isRecording 
                    ? 'border-red-500 scale-110' 
                    : mode === 'booth' ? 'border-indigo-500 hover:scale-105' : 'border-white hover:scale-105'
                }`}
            >
                <div className={`w-16 h-16 rounded-full transition-all duration-200 ${
                    isRecording 
                    ? 'bg-red-500 scale-50 rounded-md' 
                    : mode === 'booth' ? 'bg-indigo-500' : 'bg-white'
                }`} />
            </button>

            {/* Placeholder / Flash Toggle (Optional future use) */}
            <div className="w-12 flex justify-center">
               {/* Future flash toggle could go here */}
            </div>
        </div>
      </div>
    </div>
  );
};