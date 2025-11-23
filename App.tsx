import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import JSZip from 'jszip';
// @ts-ignore
import { jwtDecode } from 'jwt-decode';
import { User, Event, MediaItem, UserRole, TierLevel, Language, TranslateFn, TIER_CONFIG, getTierConfigForUser, getTierConfig } from './types';
import { api } from './services/api';
import { TRANSLATIONS } from './constants';
import { CameraCapture } from './components/CameraCapture';
import { AdminDashboard } from './components/AdminDashboard';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/LandingPage';
import { UserDashboard } from './components/UserDashboard';
import { EventGallery } from './components/EventGallery';
import { CreateEventModal } from './components/CreateEventModal';
import { ContactModal } from './components/ContactModal';
import { GuestLoginModal } from './components/GuestLoginModal';
import { StudioSettingsModal } from './components/StudioSettingsModal';
import { MediaReviewModal } from './components/MediaReviewModal';
import { LiveSlideshow } from './components/LiveSlideshow';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { OfflineBanner } from './components/OfflineBanner';
import { ShareTargetHandler } from './components/ShareTargetHandler';
import { ReloadPrompt } from './components/ReloadPrompt';
import { applyWatermark } from './utils/imageProcessing';
import { getStoredUserId, isKnownDevice, clearDeviceFingerprint } from './utils/deviceFingerprint';
import { socketService } from './services/socketService';

// Safe access to env variables
// @ts-ignore
const env: any = (import.meta as any).env || {};

// Security: API URL configuration
const API_URL = env.VITE_API_URL || 'http://localhost:3001';

// Security: Input validation helper
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, '').trim();
};

// SECURITY FIX: Removed insecure client-side "encryption".
// Using localStorage directly is better than a false sense of security.
// For true security, switch to HttpOnly cookies in a future update.
const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
  }
};

const safeGetItem = (key: string): string => {
  try {
    return localStorage.getItem(key) || '';
  } catch (error) {
    console.warn('Failed to read from localStorage:', error);
    return '';
  }
};

const safeRemoveItem = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to remove from localStorage:', error);
  }
};

declare global {
    interface Window {
        google: any;
    }
}

export default function App() {
  // -- State --
  const [view, setView] = useState<'landing' | 'dashboard' | 'event' | 'admin' | 'live'>('landing');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [authError, setAuthError] = useState('');
  
  // Guest Mode State
  const [guestName, setGuestName] = useState(() => safeGetItem('snapify_guest_name') || '');
  const [showGuestLogin, setShowGuestLogin] = useState(false);
  const [pendingAction, setPendingAction] = useState<'upload' | 'camera' | null>(null);

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showStudioSettings, setShowStudioSettings] = useState(false);
  
  // Media / Studio State
  const [applyWatermarkState, setApplyWatermarkState] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // Preview & Upload State
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image'|'video', src: string, file?: File } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // NEW STATE

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- FIX: Auto-Persistence --
  // This ensures that ANY change to currentUser (via API or Socket) is immediately saved.
  useEffect(() => {
    if (currentUser) {
        localStorage.setItem('snapify_user_obj', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  // -- Real-time User Updates --
  useEffect(() => {
    if (currentUser?.id) {
        socketService.connect();
        
        const handleUserUpdate = (updatedUser: User) => {
            // 1. Update Current User State
            if (updatedUser.id === currentUser.id) {
                setCurrentUser(prev => {
                    if (!prev) return null;
                    // Merge with previous state to ensure we don't lose fields 
                    // if the update payload is partial
                    return { ...prev, ...updatedUser };
                });
            }
            
            // 2. Update Admin List State
            setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
        };

        socketService.on('user_updated', handleUserUpdate);
        
        return () => { 
            socketService.off('user_updated', handleUserUpdate);
        };
    }
  }, [currentUser?.id]);

  // -- Initialization --
  const loadInitialData = async () => {
      try {
          const token = localStorage.getItem('snapify_token');
          const storedUserId = localStorage.getItem('snapify_user_id');
          
          let currentUserFromStorage: User | null = null;

          // Restore User Session
          if (token && storedUserId) {
              try {
                  const savedUserStr = localStorage.getItem('snapify_user_obj');
                  if (savedUserStr) {
                      currentUserFromStorage = JSON.parse(savedUserStr);
                      setCurrentUser(currentUserFromStorage);
                  }

                  // Fetch data relative to user
                  const eventsData = await api.fetchEvents();
                  setEvents(eventsData);
                  
                  if (currentUserFromStorage?.role === UserRole.ADMIN) {
                      const usersData = await api.fetchUsers();
                      setAllUsers(usersData);
                  }
              } catch (e) {
                  console.warn("Session expired or invalid", e);
                  handleLogout(); // Clean cleanup
                  currentUserFromStorage = null;
              }
          }

          // Check URL for Event
          const params = new URLSearchParams(window.location.search);
          const sharedEventId = params.get('event');
          
          if (sharedEventId) {
               try {
                   const sharedEvent = await api.fetchEventById(sharedEventId);
                   if (sharedEvent) {
                       // Add shared event to state if not present
                       setEvents(prev => {
                           if (!prev.find(e => e.id === sharedEventId)) return [...prev, sharedEvent];
                           return prev;
                       });
                       
                       // CRITICAL: Prioritize Event View if URL param exists
                       setCurrentEventId(sharedEventId);
                       setView('event'); 
                       
                       incrementEventViews(sharedEventId, [sharedEvent]);
                   }
               } catch (error) {
                   console.error("Failed to fetch shared event", error);
                   // If event fetch fails, fall back to dashboard logic
                   if (currentUserFromStorage) {
                       setView(currentUserFromStorage.role === UserRole.ADMIN ? 'admin' : 'dashboard');
                   }
               }
          } else {
              // No shared event in URL -> Route based on auth status
              if (currentUserFromStorage) {
                  setView(currentUserFromStorage.role === UserRole.ADMIN ? 'admin' : 'dashboard');
              } else {
                  setView('landing');
              }
          }

      } catch (err) {
          console.error("Failed to load data", err);
          setView('landing');
      }
  };

  useEffect(() => {
    loadInitialData();
    const initGoogle = () => {
        if (window.google && env.VITE_GOOGLE_CLIENT_ID) {
            try {
                window.google.accounts.id.initialize({
                    client_id: env.VITE_GOOGLE_CLIENT_ID,
                    callback: handleGoogleResponse
                });
            } catch (e) {
                console.error("Error initializing Google Auth", e);
            }
        }
    };
    if (window.google) initGoogle();
    else {
        const interval = setInterval(() => {
            if (window.google) { initGoogle(); clearInterval(interval); }
        }, 200);
        setTimeout(() => clearInterval(interval), 10000);
    }
  }, []);

  const handleGoogleResponse = async (response: any) => {
      try {
          // SECURITY: Send the raw credential to backend for verification
          const credential = response.credential;
          
          try {
              const res = await api.googleLogin(credential);
              finalizeLogin(res.user, res.token);
          } catch (e) {
              console.error("Backend auth failed", e);
              setAuthError("Authentication failed");
          }
      } catch (error) {
          console.error("Google Login Error", error);
          setAuthError(t('authErrorInvalid'));
      }
  };

  const finalizeLogin = async (user: User, token: string) => {
      setCurrentUser(user);
      localStorage.setItem('snapify_token', token);
      localStorage.setItem('snapify_user_id', user.id);
      localStorage.setItem('snapify_user_obj', JSON.stringify(user));
      
      // Refresh events with the new auth token to ensure we get user-specific data
      try {
          const eventsData = await api.fetchEvents();
          setEvents(eventsData);

          // Check URL for event parameter first (highest priority)
          const params = new URLSearchParams(window.location.search);
          const urlEventId = params.get('event');
          
          // Determine target view
          if (urlEventId) {
              // If there's an event in URL, ensure it's loaded and redirect
              // We check if the event is already in the fetched list
              const targetEvent = eventsData.find(e => e.id === urlEventId);
              
              if (targetEvent) {
                 setCurrentEventId(urlEventId);
                 setView('event');
              } else {
                 // If not in list (maybe public event not owned by user), try fetching it specifically
                 try {
                     const sharedEvent = await api.fetchEventById(urlEventId);
                     setEvents(prev => [...prev, sharedEvent]);
                     setCurrentEventId(urlEventId);
                     setView('event');
                 } catch(err) {
                     console.error("Could not load URL event after login", err);
                     // Fallback to dashboard
                     setView('dashboard');
                 }
              }
          } else if (currentEventId) {
              // If we have a current event in state (preserved from before login), stay on that event
              // Re-verify it exists in the new authenticated context
               const targetEvent = eventsData.find(e => e.id === currentEventId);
               if(targetEvent) {
                   setView('event');
               } else {
                   // Try fetching specifically again
                   try {
                       const sharedEvent = await api.fetchEventById(currentEventId);
                       setEvents(prev => {
                           if (prev.some(e => e.id === currentEventId)) return prev;
                           return [...prev, sharedEvent];
                       });
                       setView('event');
                   } catch {
                       setView('dashboard');
                   }
               }
          } else if (user.role === UserRole.ADMIN) {
              api.fetchUsers().then(setAllUsers);
              setView('admin');
          } else {
              setView('dashboard');
          }
      } catch (error) {
          console.error("Error during finalizeLogin", error);
          // Fallback
          setView('dashboard');
      }
  };

  const incrementEventViews = async (id: string, currentEvents: Event[]) => {
      const updated = currentEvents.map(e => {
          if (e.id === id) return { ...e, views: (e.views || 0) + 1 };
          return e;
      });
      setEvents(updated);
      const evt = currentEvents.find(e => e.id === id);
      if (evt) await api.updateEvent({ ...evt, views: (evt.views || 0) + 1 });
  };

  useEffect(() => { localStorage.setItem('snapify_lang', language); }, [language]);
  const t: TranslateFn = (key: string) => {
    return TRANSLATIONS[language][key] || TRANSLATIONS['en'][key] || key;
  };
  const changeLanguage = (lang: Language) => setLanguage(lang);

  const activeEvent = events.find(e => e.id === currentEventId);
  const isOwner = currentUser && activeEvent && currentUser.id === activeEvent.hostId;
  const isEventExpired = activeEvent?.expiresAt ? new Date() > new Date(activeEvent.expiresAt) : false;
  const hostUser = allUsers.find(u => u.id === activeEvent?.hostId) || (currentUser?.id === activeEvent?.hostId ? currentUser : undefined);
  const isHostPhotographer = hostUser?.role === UserRole.PHOTOGRAPHER;

  const handleEmailAuth = async (data: any, isSignUp: boolean) => {
    if (isLoggingIn) return;
    setAuthError('');
    setIsLoggingIn(true);
    
    try {
        const { email, password, name, isPhotographer, studioName } = data;
        
        // Input validation
        if (!email || !password) {
            setAuthError(t('authErrorRequired'));
            return;
        }
        
        if (!validateEmail(email)) {
            setAuthError(t('authErrorInvalidEmail'));
            return;
        }
        
        if (password.length < 6) {
            setAuthError(t('authErrorPasswordLength'));
            return;
        }
        
        if (isSignUp) {
            if (!name || name.trim().length < 2) {
                setAuthError(t('authErrorNameRequired'));
                return;
            }
            
            const sanitizedName = sanitizeInput(name);
            const sanitizedStudioName = studioName ? sanitizeInput(studioName) : undefined;
            
            const newUser: User = {
                id: `user-${Date.now()}`,
                name: sanitizedName,
                email: email.toLowerCase().trim(),
                role: UserRole.USER, 
                tier: TierLevel.FREE,
                storageUsedMb: 0,
                storageLimitMb: 100,
                joinedDate: new Date().toISOString().split('T')[0],
                studioName: isPhotographer ? sanitizedStudioName : undefined
            };
            
            const res = await api.createUser(newUser);
            await finalizeLogin(res.user, res.token);
        } else {
            const res = await api.login(email.toLowerCase().trim(), password);
            await finalizeLogin(res.user, res.token);
        }
    } catch (e) { 
        console.error(e);
        setAuthError(t('authErrorInvalid')); 
    } finally {
        setIsLoggingIn(false);
    }
  };

  const handleGuestLogin = (name: string) => {
    setGuestName(name);
    safeSetItem('snapify_guest_name', name);
    setShowGuestLogin(false);
    
    // After guest login, ensure we stay on the event view if we have an ID
    if (currentEventId) {
        setView('event');
    }

    if (pendingAction === 'camera') setIsCameraOpen(true);
    else if (pendingAction === 'upload') fileInputRef.current?.click();
    setPendingAction(null);
  };

  // Redirect to Landing Page for login, but PRESERVE currentEventId in state
  // This ensures finalizeLogin redirects back to the event after auth
  const handleSignInRequest = () => {
      setShowGuestLogin(false);
      // We keep currentEventId set so finalizeLogin knows where to return
      setView('landing');
  };

  const handleCreateEvent = async (data: any) => {
    if (!currentUser) return;
    // FIX: Destructure 'pin' correctly from the data object
    const { title, date, theme, description, pin, adminOptions } = data;
    
    let expiresAt: string | null = null;
    const now = new Date().getTime();

    if (currentUser.role === UserRole.ADMIN && adminOptions) {
        const { expiryType, durationValue, durationUnit } = adminOptions;
        if (expiryType === 'unlimited') expiresAt = null;
        else if (expiryType === 'custom') {
            let multiplier = 1000; 
            if (durationUnit === 'minutes') multiplier = 60 * 1000;
            if (durationUnit === 'hours') multiplier = 60 * 60 * 1000;
            if (durationUnit === 'days') multiplier = 24 * 60 * 60 * 1000;
            expiresAt = new Date(now + (durationValue * multiplier)).toISOString();
        } else {
             const days = parseInt(expiryType.replace('d', ''));
             expiresAt = new Date(now + (days || 30) * 24 * 60 * 60 * 1000).toISOString();
        }
    } else {
        const config = getTierConfigForUser(currentUser);
        if (config.maxDurationDays === null) expiresAt = null;
        else if (currentUser.tier === TierLevel.FREE && config.maxDurationHours) expiresAt = new Date(now + config.maxDurationHours * 60 * 60 * 1000).toISOString();
        else expiresAt = new Date(now + (config.maxDurationDays || 30) * 24 * 60 * 60 * 1000).toISOString();
    }

    const newEvent: Event = {
      id: crypto.randomUUID(),
      title: title,
      date: date,
      description: description,
      hostId: currentUser.id,
      code: Math.random().toString(36).substring(2, 8).toUpperCase(),
      media: [],
      expiresAt,
      pin: pin, // FIX: Assign the pin to the new event
      views: 0,
      downloads: 0
    };

    try {
        const created = await api.createEvent(newEvent);
        setEvents(prev => [created, ...prev]);
        setShowCreateModal(false);
        setCurrentEventId(created.id);
        setView('event');
    } catch (e) {
        alert("Failed to create event");
    }
  };

  const handleUpdateEvent = async (updatedEvent: Event) => {
      await api.updateEvent(updatedEvent);
      setEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
  };

  const handleSetCoverImage = async (item: MediaItem) => {
    if (!currentEventId || !activeEvent) return;
      const updated = { ...activeEvent, coverImage: item.url, coverMediaType: item.type };
      await api.updateEvent(updated);
      setEvents(prev => prev.map(e => e.id === currentEventId ? updated : e));
      alert(t('coverSet'));
  };

  const handleLikeMedia = async (item: MediaItem) => {
      if (!currentEventId) return;
      setEvents(prev => prev.map(e => {
          if (e.id === currentEventId) {
              return { ...e, media: e.media.map(m => m.id === item.id ? { ...m, likes: (m.likes || 0) + 1 } : m) };
          }
          return e;
      }));
      await api.likeMedia(item.id);
  };

  const handleDeleteEvent = async (id: string) => {
      await api.deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      if (currentEventId === id) setCurrentEventId(null);
  };

  const handleUpdateUser = async (updatedUser: User) => {
      const limit = TIER_CONFIG[updatedUser.tier].storageLimitMb;
      const userWithLimit = { ...updatedUser, storageLimitMb: limit };
      await api.updateUser(userWithLimit);
      setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? userWithLimit : u));
      if (currentUser && currentUser.id === updatedUser.id) {
          setCurrentUser(userWithLimit);
          localStorage.setItem('snapify_user_obj', JSON.stringify(userWithLimit));
      }
  };

  const handleDeleteMedia = async (eventId: string, mediaId: string) => {
      await api.deleteMedia(mediaId);
      setEvents(prev => prev.map(event => 
          event.id === eventId 
              ? { ...event, media: event.media.filter(media => media.id !== mediaId) }
              : event
      ));
  };

  const handleUpdateStudioSettings = async (updates: Partial<User>) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, ...updates };
    await api.updateUser(updatedUser);
    setCurrentUser(updatedUser);
    setAllUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
    localStorage.setItem('snapify_user_obj', JSON.stringify(updatedUser));
  };

  const initiateMediaAction = (action: 'upload' | 'camera') => {
    if (currentUser || guestName) {
      if (action === 'camera') setIsCameraOpen(true);
      else fileInputRef.current?.click();
    } else {
      setPendingAction(action);
      setShowGuestLogin(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !activeEvent) return;
    const file = e.target.files[0];
    const type = file.type.startsWith('video') ? 'video' : 'image';
    const url = URL.createObjectURL(file);
    setPreviewMedia({ type, src: url, file });
  };

  const handleCameraCapture = (imageSrc: string) => {
    if (!activeEvent) return;
    setIsCameraOpen(false);
    setPreviewMedia({ type: 'image', src: imageSrc });
  };

  const confirmUpload = async (userCaption: string, userPrivacy: 'public' | 'private') => {
    if (!activeEvent || !previewMedia) return;
    setIsUploading(true);
    setUploadProgress(0); // Reset progress

    try {
        const { type, src, file } = previewMedia;
        const uploader = currentUser ? (currentUser.studioName || currentUser.name) : guestName || "Guest";
        const fileSizeMb = file ? file.size / (1024 * 1024) : (src.length * (3/4)) / (1024*1024);
        
        // SECURITY FIX: Use activeEvent.hostTier to determine capabilities
        // The event capabilities are determined by the HOST's tier, not the uploader's tier.
        
        if (type === 'video') {
             // Determine the effective tier configuration
             let config;
             if (currentUser && activeEvent.hostId === currentUser.id) {
                 // I am the host
                 config = getTierConfigForUser(currentUser);
             } else if (activeEvent.hostTier) {
                 // I am a guest, use the host's tier from the event data
                 config = getTierConfig(activeEvent.hostTier);
             } else {
                 // Fallback (should rarely happen if backend returns hostTier)
                 config = TIER_CONFIG[TierLevel.FREE];
             }

             if (!config.allowVideo) {
                alert(t('videoRestricted'));
                setIsUploading(false);
                return;
            }
        }
        
        if (currentUser) {
            if (currentUser.storageUsedMb + fileSizeMb > currentUser.storageLimitMb) {
                alert(t('storageLimit'));
                setIsUploading(false);
                return;
            }
        }
        
        let finalCaption = userCaption;
        if (!finalCaption && type === 'image') {
             finalCaption = await api.generateImageCaption(src);
        }
        const config = currentUser ? getTierConfigForUser(currentUser) : TIER_CONFIG[TierLevel.FREE];
        const canWatermark = currentUser?.role === UserRole.PHOTOGRAPHER && config.allowWatermark;
        const shouldWatermark = applyWatermarkState && canWatermark;
        let uploadFile = file;
        
        if ((shouldWatermark && type === 'image' && currentUser) || (!file && type === 'image')) {
             let source = src;
             if (shouldWatermark && currentUser) {
                source = await applyWatermark(src, currentUser.studioName || null, currentUser.logoUrl || null, currentUser.watermarkOpacity, currentUser.watermarkSize, currentUser.watermarkPosition, currentUser.watermarkOffsetX, currentUser.watermarkOffsetY);
             }
             const res = await fetch(source);
             const blob = await res.blob();
             uploadFile = new File([blob], "capture.jpg", { type: "image/jpeg" });
        }

        const metadata: Partial<MediaItem> = {
            id: `media-${Date.now()}`,
            type,
            caption: finalCaption,
            uploadedAt: new Date().toISOString(),
            uploaderName: uploader,
            // NEW: Include uploaderId for guest tracking
            uploaderId: currentUser ? currentUser.id : `guest-${guestName}-${Date.now()}`,
            isWatermarked: shouldWatermark,
            watermarkText: currentUser?.studioName,
            privacy: userPrivacy
        };

        if (uploadFile) {
            // Use new uploadMedia with progress callback
            await api.uploadMedia(uploadFile, metadata, activeEvent.id, (percent) => {
                setUploadProgress(percent);
            });
        }
        if (currentUser) {
            updateUserStorage(currentUser.id, fileSizeMb);
        }
        setPreviewMedia(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
        console.error("Upload failed", e);
        alert("Upload failed. Please try again.");
    } finally {
        setIsUploading(false);
        setUploadProgress(0);
    }
  };

  const downloadEventZip = async (targetEvent: Event) => {
      if (!targetEvent || targetEvent.media.length === 0) return;
      setDownloadingZip(true);
      try {
          const zip = new JSZip();
          const folder = zip.folder(targetEvent.title.replace(/[^a-z0-9]/gi, '_'));
          const eventHost = allUsers.find(u => u.id === targetEvent.hostId); 
          const isFreeTier = !eventHost || eventHost.tier === TierLevel.FREE;
          const fetchFile = async (url: string) => {
               const fetchUrl = url.startsWith('http') || url.startsWith('data:') ? url : `${(env.VITE_API_URL || '')}${url}`;
               const res = await fetch(fetchUrl);
               return res.blob();
          };
          const blobToBase64 = (blob: Blob): Promise<string> => new Promise(resolve => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
          });
          for (const item of targetEvent.media) {
              const filename = `${item.id}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
              if (!item.url) continue;
              let blob = await fetchFile(item.url);
              if (isFreeTier && item.type === 'image') {
                  try {
                      const base64 = await blobToBase64(blob);
                      const watermarkedDataUrl = await applyWatermark(base64, "SnapifY", null, 0.5, 30, 'center', 0, 0);
                      const cleanData = watermarkedDataUrl.split(',')[1];
                      if (folder) folder.file(filename, cleanData, { base64: true });
                      continue;
                  } catch (e) { console.warn("Failed to watermark image for zip", e); }
              }
              if (folder) folder.file(filename, blob);
          }
          const content = await zip.generateAsync({ type: "blob" });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(content);
          link.download = `${targetEvent.title.replace(/[^a-z0-9]/gi, '_')}_memories.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          await api.updateEvent({ ...targetEvent, downloads: (targetEvent.downloads || 0) + 1 });
          setEvents(prev => prev.map(e => e.id === targetEvent.id ? { ...e, downloads: (e.downloads || 0) + 1 } : e));
      } catch (err) {
          console.error("Failed to zip", err);
          alert(t('zipError'));
      } finally {
          setDownloadingZip(false);
      }
  };

  const handleLogout = () => {
      // 1. Reset state immediately
      setCurrentUser(null);
      setGuestName('');
      setView('landing');
      setCurrentEventId(null);
      
      // 2. Clear storage
      localStorage.removeItem('snapify_token');
      localStorage.removeItem('snapify_user_id');
      localStorage.removeItem('snapify_user_obj');
      safeRemoveItem('snapify_guest_name');
      clearDeviceFingerprint();
      
      // 3. Clean URL
      // FIX: Force clear URL and push to history to ensure reload doesn't restore state
      if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.search = ""; 
          window.history.pushState({}, '', url.toString()); // Use pushState instead of replaceState to ensure clear history entry
          window.location.href = '/'; // Force hard reload to clear memory
      }
  };

  const handleBack = () => {
      if (view === 'event') {
          setCurrentEventId(null);
          // FIX: Clear the ?event=... param when going back to dashboard/landing
          const url = new URL(window.location.href);
          if (url.searchParams.has('event')) {
             url.searchParams.delete('event');
             window.history.replaceState({}, '', url.toString());
          }

          setView(currentUser ? (currentUser.role === UserRole.ADMIN ? 'admin' : 'dashboard') : 'landing');
      } else if (view === 'dashboard' || view === 'admin') {
          handleLogout();
      }
  };

  const updateUserStorage = async (userId: string, fileSizeMb: number) => {
      const user = allUsers.find(u => u.id === userId);
      if (user) {
          const updatedUser = { ...user, storageUsedMb: user.storageUsedMb + fileSizeMb };
          await api.updateUser(updatedUser);
          setAllUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
          if (currentUser && currentUser.id === userId) {
              setCurrentUser(updatedUser);
              localStorage.setItem('snapify_user_obj', JSON.stringify(updatedUser));
          }
      }
  };

  const handleIncomingShare = (text: string) => {
      if (currentEventId) {
          alert(`Shared to SnapifY: ${text}`);
      } else {
          localStorage.setItem('snapify_shared_pending', text);
      }
  };

  // Security: Enhanced error handling for critical operations
  const handleCriticalError = (error: any, operation: string) => {
    console.error(`Critical error in ${operation}:`, error);
    // In production, this could send to error reporting service
    alert(`An unexpected error occurred during ${operation}. Please try again.`);
  };

  return (
    // APP SHELL LAYOUT - ADAPTIVE & STATIC HEADER
    // h-[100dvh] ensures app fills the visible viewport perfectly on mobile browsers
    // No root padding allows Landing Page to bleed to edges
    <div className="h-[100dvh] w-full flex flex-col bg-slate-50">
      <OfflineBanner t={t} />
      <ShareTargetHandler onShareReceive={handleIncomingShare} />
      <ReloadPrompt />

      {/* STATIC HEADER AREA */}
      {/* Moved Navigation out of scroll view to ensure it remains static at the top */}
      {view !== 'landing' && (
        <div className="flex-shrink-0 z-50 w-full bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
             <Navigation 
                currentUser={currentUser}
                guestName={guestName}
                view={view}
                currentEventTitle={activeEvent?.title}
                language={language}
                onChangeLanguage={changeLanguage}
                onLogout={handleLogout}
                onSignIn={handleSignInRequest} 
                onHome={() => {
                  setCurrentEventId(null);
                  if (currentUser) setView(currentUser.role === UserRole.ADMIN ? 'admin' : 'dashboard');
                  else setView('landing');
                }}
                onBack={handleBack}
                onToAdmin={() => setView('admin')}
                onOpenSettings={() => setShowStudioSettings(true)}
                t={t}
             />
        </div>
      )}
      
      {/* SCROLLABLE CONTENT AREA */}
      {/* Contains all the main views and scrolls independently */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth w-full relative no-scrollbar">
          
          {view === 'landing' ? (
            // Landing page can handle its own padding if needed, or bleed to edges
            <div className="min-h-full w-full">
              <LandingPage 
                onGoogleLogin={() => { if (window.google) window.google.accounts.id.prompt(); }}
                onEmailAuth={handleEmailAuth}
                onContactSales={() => setShowContactModal(true)}
                isLoggingIn={isLoggingIn}
                authError={authError}
                language={language}
                onChangeLanguage={changeLanguage}
                t={t}
              />
              <PWAInstallPrompt t={t} />
              {showContactModal && <ContactModal onClose={() => setShowContactModal(false)} t={t} />}
            </div>
          ) : (
             // AUTHENTICATED / EVENT VIEWS
             <div className="flex flex-col min-h-full">
                 <div className="flex-1 pb-32"> 
                    {view === 'admin' && currentUser?.role === UserRole.ADMIN && (
                         <AdminDashboard 
                            users={allUsers}
                            events={events}
                            onClose={() => setView('dashboard')}
                            onLogout={handleLogout}
                            onDeleteUser={async (id) => { await api.deleteUser(id); setAllUsers(prev => prev.filter(u => u.id !== id)); }}
                            onDeleteEvent={handleDeleteEvent}
                            onDeleteMedia={handleDeleteMedia}
                            onUpdateEvent={handleUpdateEvent}
                            onUpdateUser={handleUpdateUser}
                            onNewEvent={() => setShowCreateModal(true)}
                            onDownloadEvent={downloadEventZip}
                            t={t}
                         />
                    )}

                    {view === 'dashboard' && currentUser && (
                        <UserDashboard 
                          events={events}
                          currentUser={currentUser}
                          onNewEvent={() => setShowCreateModal(true)}
                          onSelectEvent={(id) => { setCurrentEventId(id); setView('event'); }}
                          onRequestUpgrade={() => setShowContactModal(true)}
                          t={t}
                        />
                    )}

                    {view === 'event' && activeEvent && (
                        <EventGallery 
                          key={activeEvent.id} // Force remount on ID change to reset PIN state
                          event={activeEvent}
                          currentUser={currentUser}
                          hostUser={hostUser}
                          isEventExpired={isEventExpired}
                          isOwner={Boolean(isOwner)}
                          isHostPhotographer={Boolean(isHostPhotographer)}
                          downloadingZip={downloadingZip}
                          applyWatermark={applyWatermarkState}
                          setApplyWatermark={setApplyWatermarkState}
                          onDownloadAll={(media) => downloadEventZip({ ...activeEvent, media: media || activeEvent.media })}
                          onSetCover={handleSetCoverImage}
                          onUpload={initiateMediaAction}
                          onLike={handleLikeMedia}
                          onOpenLiveSlideshow={() => setView('live')}
                          t={t}
                        />
                    )}
                 </div>
             </div>
          )}
          
          {/* Live Slideshow - Full Screen Overlay */}
          {view === 'live' && activeEvent && (
                <LiveSlideshow 
                  event={activeEvent}
                  currentUser={currentUser}
                  hostUser={hostUser}
                  onClose={() => setView('event')}
                  t={t}
                />
          )}
      </div>

      {/* FLOATING ELEMENTS & MODALS (Outside scroll view to stay on top) */}
      {view !== 'landing' && <PWAInstallPrompt t={t} />}
      
      {/* MODIFIED: Update file input accept attribute to be more inclusive for mobile */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,video/*" 
        onChange={handleFileUpload} 
      />
      
      {previewMedia && (
        <MediaReviewModal
            type={previewMedia.type}
            src={previewMedia.src}
            onConfirm={confirmUpload}
            onRetake={() => {
                setPreviewMedia(null);
                initiateMediaAction(previewMedia.type === 'video' && !previewMedia.file ? 'camera' : 'upload');
            }}
            onCancel={() => setPreviewMedia(null)}
            isUploading={isUploading}
            uploadProgress={uploadProgress} // Pass progress
            isRegistered={!!currentUser}
            t={t}
        />
      )}

      {isCameraOpen && !previewMedia && <CameraCapture onClose={() => setIsCameraOpen(false)} onCapture={handleCameraCapture} t={t} />}
      {showContactModal && <ContactModal onClose={() => setShowContactModal(false)} t={t} />}
      {showGuestLogin && <GuestLoginModal onLogin={handleGuestLogin} onRegister={handleSignInRequest} onCancel={() => setShowGuestLogin(false)} t={t} />}
      {showCreateModal && currentUser && <CreateEventModal currentUser={currentUser} onClose={() => setShowCreateModal(false)} onCreate={handleCreateEvent} t={t} />}
      {showStudioSettings && currentUser && <StudioSettingsModal currentUser={currentUser} onClose={() => setShowStudioSettings(false)} onSave={handleUpdateStudioSettings} t={t} />}
    </div>
  );
}