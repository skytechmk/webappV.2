import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import JSZip from 'jszip';
// @ts-ignore
import { jwtDecode } from 'jwt-decode';
import { User, Event, MediaItem, UserRole, TierLevel, Language, TranslateFn, TIER_CONFIG, getTierConfigForUser, getTierConfig } from './types';
import { api } from './services/api';
import { TRANSLATIONS } from './constants';
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
import { clearDeviceFingerprint } from './utils/deviceFingerprint';
import { socketService } from './services/socketService';

// @ts-ignore
const env: any = (import.meta as any).env || {};

const API_URL = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || 'http://localhost:3001') : '';

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, '').trim();
};

const safeSetItem = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch (error) { console.warn('Failed to save to localStorage:', error); }
};

const safeGetItem = (key: string): string => {
  try { return localStorage.getItem(key) || ''; } catch (error) { return ''; }
};

const safeRemoveItem = (key: string) => {
  try { localStorage.removeItem(key); } catch (error) { }
};

declare global {
    interface Window {
        google: any;
    }
}

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard' | 'event' | 'admin' | 'live'>('landing');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [authError, setAuthError] = useState('');

  const [guestName, setGuestName] = useState(() => safeGetItem('snapify_guest_name') || '');
  const [showGuestLogin, setShowGuestLogin] = useState(false);
  const [pendingAction, setPendingAction] = useState<'upload' | 'camera' | null>(null);
  const [lastUsedInput, setLastUsedInput] = useState<'upload' | 'camera'>('upload');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<TierLevel | undefined>(undefined);
  const [showStudioSettings, setShowStudioSettings] = useState(false);

  const [applyWatermarkState, setApplyWatermarkState] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const [previewMedia, setPreviewMedia] = useState<{ type: 'image'|'video', src: string, file?: File } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
        localStorage.setItem('snapify_user_obj', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  useEffect(() => {
      socketService.connect();
      const handleForceReload = async () => {
          if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const registration of registrations) {
                  await registration.unregister();
              }
          }
          if ('caches' in window) {
              const cacheNames = await caches.keys();
              cacheNames.forEach(cacheName => caches.delete(cacheName));
          }
          window.location.reload();
      };
      socketService.on('force_client_reload', handleForceReload);
      return () => { socketService.off('force_client_reload', handleForceReload); };
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
        socketService.connect();
        const handleUserUpdate = (updatedUser: User) => {
            if (updatedUser.id === currentUser.id) {
                setCurrentUser(prev => {
                    if (!prev) return null;
                    return { ...prev, ...updatedUser };
                });
            }
            setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
        };
        socketService.on('user_updated', handleUserUpdate);
        return () => { socketService.off('user_updated', handleUserUpdate); };
    }
  }, [currentUser?.id]);

  const loadInitialData = async () => {
      try {
          const token = localStorage.getItem('snapify_token');
          const storedUserId = localStorage.getItem('snapify_user_id');
          let currentUserFromStorage: User | null = null;

          if (token && storedUserId) {
              try {
                  const savedUserStr = localStorage.getItem('snapify_user_obj');
                  if (savedUserStr) {
                      currentUserFromStorage = JSON.parse(savedUserStr);
                      setCurrentUser(currentUserFromStorage);
                  }
                  const eventsData = await api.fetchEvents();
                  setEvents(eventsData);

                  if (currentUserFromStorage?.role === UserRole.ADMIN) {
                      const usersData = await api.fetchUsers();
                      setAllUsers(usersData);
                  }
              } catch (e) {
                  handleLogout();
                  currentUserFromStorage = null;
              }
          }

          const params = new URLSearchParams(window.location.search);
          const sharedEventId = params.get('event');
          if (sharedEventId) {
               try {
                   const sharedEvent = await api.fetchEventById(sharedEventId);
                   if (sharedEvent) {
                       setEvents(prev => {
                           if (!prev.find(e => e.id === sharedEventId)) return [...prev, sharedEvent];
                           return prev;
                       });
                       setCurrentEventId(sharedEventId);
                       setView('event');
                       incrementEventViews(sharedEventId, [sharedEvent]);
                   }
               } catch (error) {
                   if (currentUserFromStorage) {
                       setView(currentUserFromStorage.role === UserRole.ADMIN ? 'admin' : 'dashboard');
                   }
               }
          } else {
              if (currentUserFromStorage) {
                  setView(currentUserFromStorage.role === UserRole.ADMIN ? 'admin' : 'dashboard');
              } else {
                  setView('landing');
              }
          }
      } catch (err) {
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
            } catch (e) {}
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
          const credential = response.credential;
          try {
              const res = await api.googleLogin(credential);
              finalizeLogin(res.user, res.token);
          } catch (e) { setAuthError("Authentication failed"); }
      } catch (error) { setAuthError(TRANSLATIONS[language]['authErrorInvalid']); }
  };

  const finalizeLogin = async (user: User, token: string) => {
      setCurrentUser(user);
      localStorage.setItem('snapify_token', token);
      localStorage.setItem('snapify_user_id', user.id);
      localStorage.setItem('snapify_user_obj', JSON.stringify(user));

      try {
          const eventsData = await api.fetchEvents();
          setEvents(eventsData);
          const params = new URLSearchParams(window.location.search);
          const urlEventId = params.get('event');
          if (urlEventId) {
              const targetEvent = eventsData.find(e => e.id === urlEventId);
              if (targetEvent) {
                 setCurrentEventId(urlEventId);
                 setView('event');
              } else {
                 try {
                     const sharedEvent = await api.fetchEventById(urlEventId);
                     setEvents(prev => [...prev, sharedEvent]);
                     setCurrentEventId(urlEventId);
                     setView('event');
                 } catch(err) { setView('dashboard'); }
              }
          } else if (user.role === UserRole.ADMIN) {
              api.fetchUsers().then(setAllUsers);
              setView('admin');
          } else {
              setView('dashboard');
          }
      } catch (error) { setView('dashboard'); }
  };

  // FIX: Atomic view increment
  const incrementEventViews = async (id: string, currentEvents: Event[]) => {
      // Optimistic UI update
      const updated = currentEvents.map(e => {
          if (e.id === id) return { ...e, views: (e.views || 0) + 1 };
          return e;
      });
      setEvents(updated);
      // Call server endpoint
      await fetch(`${API_URL}/api/events/${id}/view`, { method: 'POST' });
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
        if (!email || !password) return setAuthError(t('authErrorRequired'));
        if (!validateEmail(email)) return setAuthError(t('authErrorInvalidEmail'));
        if (password.length < 6) return setAuthError(t('authErrorPasswordLength'));
        if (isSignUp) {
            if (!name || name.trim().length < 2) return setAuthError(t('authErrorNameRequired'));
            const sanitizedName = sanitizeInput(name);
            const newUser: User = {
                id: `user-${Date.now()}`,
                name: sanitizedName,
                email: email.toLowerCase().trim(),
                role: UserRole.USER,
                tier: TierLevel.FREE,
                storageUsedMb: 0,
                storageLimitMb: 100,
                joinedDate: new Date().toISOString().split('T')[0],
                studioName: isPhotographer ? sanitizeInput(studioName) : undefined
            };
            const res = await api.createUser(newUser);
            await finalizeLogin(res.user, res.token);
        } else {
            const res = await api.login(email.toLowerCase().trim(), password);
            await finalizeLogin(res.user, res.token);
        }
    } catch (e) { setAuthError(t('authErrorInvalid')); } finally { setIsLoggingIn(false); }
  };

  const handleGuestLogin = (name: string) => {
    setGuestName(name);
    safeSetItem('snapify_guest_name', name);
    setShowGuestLogin(false);
    if (currentEventId) setView('event');
    if (pendingAction === 'camera') cameraInputRef.current?.click();
    else if (pendingAction === 'upload') fileInputRef.current?.click();
    setPendingAction(null);
  };

  const handleSignInRequest = () => {
      setShowGuestLogin(false);
      setView('landing');
  };

  const handleCreateEvent = async (data: any) => {
    if (!currentUser) return;
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
      pin: pin,
      views: 0,
      downloads: 0
    };

    try {
        const created = await api.createEvent(newEvent);
        setEvents(prev => [created, ...prev]);
        setShowCreateModal(false);
        setCurrentEventId(created.id);
        setView('event');
    } catch (e) { alert("Failed to create event"); }
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
    setLastUsedInput(action);
    if (currentUser || guestName) {
      if (action === 'camera') cameraInputRef.current?.click();
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

  const confirmUpload = async (userCaption: string, userPrivacy: 'public' | 'private') => {
    if (!activeEvent || !previewMedia) return;
    setIsUploading(true);
    setUploadProgress(0);

    try {
        const { type, src, file } = previewMedia;
        const uploader = currentUser ? (TIER_CONFIG[currentUser.tier].allowBranding && currentUser.studioName ? currentUser.studioName : currentUser.name) : guestName || "Guest";

        if (type === 'video') {
             let config;
             if (currentUser && activeEvent.hostId === currentUser.id) {
                 config = getTierConfigForUser(currentUser);
             } else if (activeEvent.hostTier) {
                 config = getTierConfig(activeEvent.hostTier);
             } else {
                 config = TIER_CONFIG[TierLevel.FREE];
             }
             if (!config.allowVideo) {
                alert(t('videoRestricted'));
                setIsUploading(false);
                return;
            }
        }

        // NOTE: Client-side check only for UX. Real quota check is on server.
        const fileSizeMb = file ? file.size / (1024 * 1024) : 0;
        if (currentUser && currentUser.storageLimitMb !== -1 && (currentUser.storageUsedMb + fileSizeMb > currentUser.storageLimitMb)) {
             // Warning only, server will enforce
        }

        let finalCaption = userCaption;
        if (!finalCaption && type === 'image') {
             finalCaption = await api.generateImageCaption(src);
        }
        const config = currentUser ? getTierConfigForUser(currentUser) : TIER_CONFIG[TierLevel.FREE];
        const canWatermark = currentUser?.role === UserRole.PHOTOGRAPHER && config.allowWatermark;
        const canUseBranding = currentUser ? TIER_CONFIG[currentUser.tier].allowBranding : false;
        const shouldWatermark = applyWatermarkState && canWatermark;
        let uploadFile = file;

        if ((shouldWatermark && type === 'image' && currentUser) || (!file && type === 'image')) {
             let source = src;
             if (shouldWatermark && currentUser) {
               source = await applyWatermark(
                 src,
                 canUseBranding ? (currentUser.studioName || null) : null,
                 canUseBranding ? (currentUser.logoUrl || null) : null,
                 canUseBranding ? currentUser.watermarkOpacity : undefined,
                 canUseBranding ? currentUser.watermarkSize : undefined,
                 canUseBranding ? currentUser.watermarkPosition : undefined,
                 canUseBranding ? currentUser.watermarkOffsetX : undefined,
                 canUseBranding ? currentUser.watermarkOffsetY : undefined
               );
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
            uploaderId: currentUser ? currentUser.id : `guest-${guestName}-${Date.now()}`,
            isWatermarked: shouldWatermark,
            watermarkText: shouldWatermark && canUseBranding ? currentUser?.studioName : undefined,
            privacy: userPrivacy
        };

        if (uploadFile) {
            await api.uploadMedia(uploadFile, metadata, activeEvent.id, (percent) => {
                setUploadProgress(percent);
            });
        }

        setPreviewMedia(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    } catch (e: any) {
        console.error("Upload failed", e);
        // Handle Storage Limit Error specifically
        if (e.message === 'Storage limit exceeded' || (e.response && e.response.status === 413)) {
            alert(t('storageLimit'));
        } else {
            alert("Upload failed. Please try again.");
        }
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
          alert(t('zipError'));
      } finally {
          setDownloadingZip(false);
      }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setGuestName('');
      setView('landing');
      setCurrentEventId(null);
      localStorage.removeItem('snapify_token');
      localStorage.removeItem('snapify_user_id');
      localStorage.removeItem('snapify_user_obj');
      safeRemoveItem('snapify_guest_name');
      clearDeviceFingerprint();
      if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.search = ""; 
          window.history.pushState({}, '', url.toString()); 
          window.location.href = '/';
      }
  };

  const handleBack = () => {
      if (view === 'event') {
          setCurrentEventId(null);
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

  const handleIncomingShare = (text: string) => {
      if (currentEventId) {
          alert(`Shared to SnapifY: ${text}`);
      } else {
          localStorage.setItem('snapify_shared_pending', text);
      }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-50">
      <OfflineBanner t={t} />
      <ShareTargetHandler onShareReceive={handleIncomingShare} />
      <ReloadPrompt />

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

      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth w-full relative no-scrollbar">
          {view === 'landing' ? (
            <div className="min-h-full w-full">
              <LandingPage
                onGoogleLogin={() => { if (window.google) window.google.accounts.id.prompt(); }}
                onEmailAuth={handleEmailAuth}
                onContactSales={(tier?: TierLevel) => { setSelectedTier(tier); setShowContactModal(true); }}
                isLoggingIn={isLoggingIn}
                authError={authError}
                language={language}
                onChangeLanguage={changeLanguage}
                t={t}
              />
              <PWAInstallPrompt t={t} />
              {showContactModal && <ContactModal onClose={() => { setShowContactModal(false); setSelectedTier(undefined); }} t={t} tier={selectedTier} />}
            </div>
          ) : (
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
                          key={activeEvent.id}
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

      {view !== 'landing' && <PWAInstallPrompt t={t} />}

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
      <input key="camera-input-v2" type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />

      {previewMedia && (
        <MediaReviewModal
            type={previewMedia.type}
            src={previewMedia.src}
            onConfirm={confirmUpload}
            onRetake={() => {
                setPreviewMedia(null);
                if (lastUsedInput === 'camera') cameraInputRef.current?.click();
                else fileInputRef.current?.click();
            }}
            onCancel={() => setPreviewMedia(null)}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            isRegistered={!!currentUser}
            t={t}
            file={previewMedia.file}
        />
      )}

      <div className="fixed bottom-4 left-4 z-[9999] pointer-events-none bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg opacity-80">
        v2.1 NATIVE
      </div>

      {showContactModal && <ContactModal onClose={() => { setShowContactModal(false); setSelectedTier(undefined); }} t={t} tier={selectedTier} />}
      {showGuestLogin && <GuestLoginModal onLogin={handleGuestLogin} onRegister={handleSignInRequest} onCancel={() => setShowGuestLogin(false)} t={t} />}
      {showCreateModal && currentUser && <CreateEventModal currentUser={currentUser} onClose={() => setShowCreateModal(false)} onCreate={handleCreateEvent} t={t} />}
      {showStudioSettings && currentUser && <StudioSettingsModal currentUser={currentUser} onClose={() => setShowStudioSettings(false)} onSave={handleUpdateStudioSettings} t={t} />}
    </div>
  );
}