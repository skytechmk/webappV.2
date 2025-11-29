import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Type, Send, Loader2, Lock, Globe, AlertCircle } from 'lucide-react';
import { TranslateFn } from '../types';
import { getExifOrientation } from '../utils/imageProcessing';

interface MediaReviewModalProps {
  type: 'image' | 'video';
  src: string;
  onConfirm: (caption: string, privacy: 'public' | 'private', rotation?: number) => void;
  onRetake: () => void;
  onCancel: () => void;
  isUploading: boolean;
  uploadProgress?: number;
  isRegistered: boolean;
  t: TranslateFn;
  file?: File; // Pass the file object to check EXIF
}

export const MediaReviewModal: React.FC<MediaReviewModalProps> = ({
  type,
  src,
  onConfirm,
  onRetake,
  onCancel,
  isUploading,
  uploadProgress = 0, 
  isRegistered,
  t,
  file
}) => {
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [rotation, setRotation] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Temporarily disable EXIF correction to test if browser handles it correctly
    setRotation(0);
  }, [file, type]);

  const handlePrivacyChange = (newPrivacy: 'public' | 'private') => {
      if (newPrivacy === 'private' && !isRegistered) {
          alert("Please login or register to upload private photos.");
          return;
      }
      setPrivacy(newPrivacy);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-200 h-[100dvh]">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent">
        <button 
            onClick={onCancel} 
            disabled={isUploading}
            className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-black/40 transition-colors disabled:opacity-0"
        >
          <X size={24} />
        </button>
        <h3 className="text-white font-bold text-lg drop-shadow-md">Preview</h3>
        <div className="w-10" /> 
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black relative overflow-hidden">
        {type === 'video' ? (
          <video 
            src={src} 
            autoPlay 
            controls 
            loop 
            playsInline
            className="max-w-full max-h-full object-contain" 
          />
        ) : (
          <img 
            ref={imgRef}
            src={src} 
            alt="Preview" 
            className="max-w-full max-h-full object-contain transition-transform duration-300" 
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="bg-black/80 backdrop-blur-xl p-6 pb-8 z-20 border-t border-white/10">
        {/* Video Duration Notice */}
        {type === 'video' && (
          <div className="flex items-center justify-center mb-4 p-2 bg-amber-500/20 border border-amber-500/30 rounded-lg">
            <AlertCircle size={14} className="text-amber-400 mr-2 flex-shrink-0" />
            <p className="text-amber-200 text-xs font-medium text-center">
              {t('videoDurationLimit') || "Videos must be 10 seconds or less"}
            </p>
          </div>
        )}

        {/* Privacy Toggle */}
        <div className="flex flex-col items-center mb-4">
             <div className="bg-white/10 rounded-full p-1 flex relative">
                 <button
                    onClick={() => handlePrivacyChange('public')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                        privacy === 'public' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                    }`}
                 >
                     <Globe size={12} />
                     {t('public')}
                 </button>
                 <button
                    onClick={() => handlePrivacyChange('private')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                        privacy === 'private' 
                            ? 'bg-white text-black' 
                            : isRegistered ? 'text-white/60 hover:text-white' : 'text-white/20 cursor-not-allowed'
                    }`}
                 >
                     <Lock size={12} />
                     {t('private')}
                 </button>
             </div>
             {!isRegistered && (
                 <p className="text-[10px] text-white/40 mt-2 flex items-center gap-1">
                     <AlertCircle size={10} /> {t('loginRequired')}
                 </p>
             )}
        </div>

        <div className="relative mb-4">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
                <Type size={16} />
            </div>
            <input 
                type="text" 
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t('leaveMessage') || "Add a caption..."}
                className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
        </div>

        <div className="flex gap-3">
          <button 
            onClick={onRetake}
            disabled={isUploading}
            className="flex-1 py-3.5 bg-white/10 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={18} />
            {t('retry') || "Retake"}
          </button>
          <button
            onClick={() => onConfirm(caption, privacy, rotation)}
            disabled={isUploading}
            className="flex-[2] py-3.5 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-70 shadow-lg shadow-indigo-900/30 relative overflow-hidden"
          >
            {isUploading ? (
                <>
                    {/* Progress Background */}
                    <div 
                        className="absolute inset-0 bg-indigo-500 transition-all duration-200 ease-out" 
                        style={{ width: `${uploadProgress}%` }} 
                    />
                    <div className="relative z-10 flex items-center gap-2">
                        <Loader2 size={18} className="animate-spin" />
                        <span>{uploadProgress}%</span>
                    </div>
                </>
            ) : (
                <>
                    <Send size={18} />
                    {t('upload') || "Upload"}
                </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};