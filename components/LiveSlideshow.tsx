import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Download, Share2, Heart, MessageSquare, Camera, Upload, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Event, MediaItem, TranslateFn, UserRole, TierLevel } from '../types';
import { socketService } from '../services/socketService';
import { api } from '../services/api';

interface LiveSlideshowProps {
  event: Event;
  currentUser: any;
  hostUser: any;
  onClose: () => void;
  t: TranslateFn;
}

export const LiveSlideshow: React.FC<LiveSlideshowProps> = ({
  event,
  currentUser,
  hostUser,
  onClose,
  t
}) => {
  const [localMedia, setLocalMedia] = useState<MediaItem[]>(event.media);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQR, setShowQR] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  const isStudioTier = hostUser?.tier === TierLevel.STUDIO;
  const qrFgColor = isStudioTier ? '#4f46e5' : '#000000';

  // Real-time updates for new media
  useEffect(() => {
    socketService.connect();
    socketService.joinEvent(event.id);

    socketService.on('media_uploaded', (newItem: MediaItem) => {
      setLocalMedia(prev => {
        if (prev.some(m => m.id === newItem.id)) return prev;
        return [newItem, ...prev];
      });
    });

    socketService.on('media_processed', (data: { id: string, previewUrl: string, url?: string }) => {
      setLocalMedia(prev => prev.map(m => 
        m.id === data.id ? { ...m, isProcessing: false, previewUrl: data.previewUrl, url: data.url || m.url } : m
      ));
    });

    socketService.on('new_like', (data: { id: string, likes: number }) => {
      setLocalMedia(prev => prev.map(m => 
        m.id === data.id ? { ...m, likes: data.likes } : m
      ));
    });

    return () => {
      socketService.disconnect();
    };
  }, [event.id]);

  // Auto-advance slideshow
  useEffect(() => {
    if (isPlaying && localMedia.length > 0) {
      intervalRef.current = setInterval(() => {
        navigate('next');
      }, 4000); // 4 seconds per slide
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, localMedia.length]);

  // Hide controls after inactivity
  useEffect(() => {
    if (showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls]);

  const navigate = useCallback((direction: 'next' | 'prev') => {
    if (isTransitioning || localMedia.length === 0) return;

    setIsTransitioning(true);
    setTransitionDirection(direction);

    setTimeout(() => {
      if (direction === 'next') {
        setCurrentIndex(prev => (prev + 1) % localMedia.length);
      } else {
        setCurrentIndex(prev => (prev - 1 + localMedia.length) % localMedia.length);
      }
      setIsTransitioning(false);
    }, 600); // Match CSS transition duration
  }, [isTransitioning, localMedia.length]);

  const handleLike = async (item: MediaItem) => {
    await api.likeMedia(item.id);
  };

  const handleDownload = (item: MediaItem) => {
    const link = document.createElement('a');
    link.href = item.url;
    link.download = `snapify_${item.id}`;
    link.click();
  };

  const handleShare = () => {
    const link = `${window.location.origin}?event=${event.id}`;
    navigator.clipboard.writeText(link).then(() => {
      alert(t('linkCopied'));
    });
  };

  const currentItem = localMedia[currentIndex];

  if (!currentItem) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white text-center">
          <Camera size={64} className="mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold mb-2">{t('noPhotos')}</h2>
          <p className="text-white/60">{t('beFirst')}</p>
          <button onClick={onClose} className="mt-6 px-6 py-3 bg-white/20 rounded-xl hover:bg-white/30 transition-colors">
            {t('close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden"
      onClick={() => setShowControls(prev => !prev)}
    >
      {/* Main Content */}
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Ken Burns Effect Container */}
        <div 
          ref={slideRef}
          className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
            isTransitioning 
              ? transitionDirection === 'next' 
                ? 'opacity-0 scale-110 translate-x-4' 
                : 'opacity-0 scale-90 -translate-x-4'
              : 'opacity-100 scale-100 translate-x-0'
          }`}
        >
          {currentItem.type === 'video' ? (
            <video
              src={currentItem.url}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full relative">
              <img
                src={currentItem.previewUrl || currentItem.url}
                alt={currentItem.caption}
                className="w-full h-full object-contain animate-ken-burns"
                draggable={false}
              />
              {/* Ken Burns overlay for smooth zoom effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20 animate-ken-burns-overlay"></div>
            </div>
          )}
        </div>

        {/* Info Overlay */}
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-8 transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}>
          <div className="max-w-4xl mx-auto">
            {/* Caption and Uploader */}
            <div className="text-center mb-6">
              {currentItem.privacy === 'private' && (
                <div className="flex items-center justify-center gap-2 text-amber-400 mb-2 text-sm font-bold uppercase tracking-wider">
                  <span>🔒</span> {t('private')}
                </div>
              )}
              <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
                {currentItem.caption || t('untitled')}
              </h2>
              <p className="text-white/70 text-lg">
                {t('by')} {currentItem.uploaderName} • {new Date(currentItem.uploadedAt).toLocaleDateString()}
              </p>
            </div>

            {/* Stats and Actions */}
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2 text-white/80">
                <Heart 
                  size={20} 
                  className={currentItem.likes ? 'fill-red-500 text-red-500' : ''}
                />
                <span className="font-bold">{currentItem.likes || 0}</span>
              </div>
              
              {currentItem.comments && currentItem.comments.length > 0 && (
                <div className="flex items-center gap-2 text-white/80">
                  <MessageSquare size={20} />
                  <span className="font-bold">{currentItem.comments.length}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLike(currentItem);
                  }}
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <Heart size={20} className={currentItem.likes ? 'fill-red-500 text-red-500' : ''} />
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(currentItem);
                  }}
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <Download size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
          <div 
            className="h-full bg-white transition-all duration-4000 linear"
            style={{ 
              width: isPlaying && !isTransitioning ? '100%' : '0%',
              transition: isPlaying && !isTransitioning ? 'width 4s linear' : 'none'
            }}
            key={currentIndex} // Reset animation on slide change
          />
        </div>

        {/* Top Controls */}
        <div className={`absolute top-0 left-0 right-0 p-6 flex justify-between items-center transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        }`}>
          <div className="flex items-center gap-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X size={24} />
            </button>
            
            <div className="text-white/80 font-medium">
              {currentIndex + 1} / {localMedia.length}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowQR(true);
              }}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <QrCode size={20} />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <Share2 size={20} />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaying(!isPlaying);
              }}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
          </div>
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('prev');
          }}
          className="absolute left-6 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors opacity-0 hover:opacity-100"
        >
          ←
        </button>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('next');
          }}
          className="absolute right-6 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors opacity-0 hover:opacity-100"
        >
          →
        </button>
      </div>

      {/* QR Code Modal */}
      {showQR && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-10">
          <div className="bg-white p-8 rounded-3xl text-center max-w-sm mx-4">
            <h3 className="text-xl font-bold text-slate-900 mb-4">{t('shareLiveWall')}</h3>
            <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 inline-block mb-4">
              <QRCodeSVG
                value={`${window.location.origin}?event=${event.id}`}
                size={200}
                fgColor={qrFgColor}
              />
            </div>
            <p className="text-slate-600 text-sm mb-4">
              {t('scanToView')}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowQR(false);
              }}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {/* CSS for Ken Burns effect */}
      <style>{`
        @keyframes ken-burns {
          0% {
            transform: scale(1) translate(0, 0);
          }
          100% {
            transform: scale(1.1) translate(-1%, -1%);
          }
        }
        
        @keyframes ken-burns-overlay {
          0% {
            opacity: 0;
          }
          50% {
            opacity: 0.3;
          }
          100% {
            opacity: 0;
          }
        }
        
        .animate-ken-burns {
          animation: ken-burns 8s ease-in-out infinite alternate;
        }
        
        .animate-ken-burns-overlay {
          animation: ken-burns-overlay 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
