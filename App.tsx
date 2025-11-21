import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import JSZip from 'jszip';
// @ts-ignore
import { jwtDecode } from 'jwt-decode';
import { User, Event, MediaItem, UserRole, TierLevel, Language, TranslateFn, TIER_CONFIG, getTierConfigForUser } from './types';
import { generateImageCaption } from './services/geminiService';
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
import { applyWatermark } from './utils/imageProcessing';
import { api } from './services/api';
import { getStoredUserId, isKnownDevice } from './utils/deviceFingerprint';

// Safe access to env variables
// @ts-ignore
const env: any = (import.meta as any).env || {};

declare global {
    interface Window {
        google: any;
    }
}

export default function App() {
  // -- State --
  const [view, setView] = useState<'landing' | 'dashboard' | 'event' | 'admin'>('landing');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [authError, setAuthError] = useState('');
  
  // Guest Mode State - Initialize from LocalStorage for persistence
  const [guestName, setGuestName] = useState(() => localStorage.getItem('snapify_guest_name') || '');
  const [showGuestLogin, setShowGuestLogin] = useState(false);
  const [pendingAction, setPendingAction] = useState<'upload' | 'camera' | null>(null);

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showStudioSettings, setShowStudioSettings] = useState(false);
  
  // Media / Studio State
  const [applyWatermarkState, setApplyWatermarkState] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Initialization --

  const loadInitialData = async () => {
      try {
          const users = await api.fetchUsers();
          setAllUsers(users);

          // Check LocalStorage for persistent login session ID
          const storedUserId = localStorage.getItem('snapify_user_id');
          let currentUserFromStorage = null;
          
          if (storedUserId) {
              const user = users.find(u => u.id === storedUserId);
              if (user) {
                  currentUserFromStorage = user;
                  setCurrentUser(user);
              }
          }
          
          // Device fingerprinting - automatic redirect for known devices
          if (!storedUserId && isKnownDevice()) {
              const storedUserIdFromFingerprint = getStoredUserId();
              if (storedUserIdFromFingerprint) {
                  const user = users.find(u => u.id === storedUserIdFromFingerprint);
                  if (user) {
                      currentUserFromStorage = user;
                      setCurrentUser(user);
                      localStorage.setItem('snapify_user_id', user.id);
                  }
              }
          }

          // Fetch events based on user context
          let evts: Event[];
          if (currentUserFromStorage) {
              // Admin users can see all events, regular users only see their own
              if (currentUserFromStorage.role === UserRole.ADMIN) {
                  evts = await api.fetchEvents(currentUserFromStorage.id); // Fetch all events for admin (pass admin's user ID)
              } else {
                  evts = await api.fetchEvents(currentUserFromStorage.id); // Only user's events
              }
          } else {
              // Not logged in - fetch all events for landing page/shared links
              evts = await api.fetchEvents();
          }
          setEvents(evts);
          
          // Language
          const storedLang = localStorage.getItem('snapify_lang') as Language;
          if (storedLang && TRANSLATIONS[storedLang]) setLanguage(storedLang);

          // URL Routing - Check for shared event links (this should work regardless of login status)
          const params = new URLSearchParams(window.location.search);
          const sharedEventId = params.get('event');
          let hasSharedEvent = false;
          
          if (sharedEventId) {
               // For shared events, we need to fetch the specific event even if user is logged in
               // This ensures shared links work for events that don't belong to the current user
               try {
                   const sharedEvent = await api.fetchEventById(sharedEventId);
                   if (sharedEvent) {
                       // Add the shared event to the current events list so it can be displayed
                       if (!evts.find(e => e.id === sharedEventId)) {
                           setEvents(prev => [...prev, sharedEvent]);
                       }
                       setCurrentEventId(sharedEventId);
                       setView('event');
                       incrementEventViews(sharedEventId, [sharedEvent]);
                       hasSharedEvent = true;
                   }
               } catch (error) {
                   console.error("Failed to fetch shared event", error);
               }
          }
          
          // Only set view to dashboard or landing if we didn't process a shared event
          if (!hasSharedEvent) {
              if (storedUserId || currentUserFromStorage) {
                  // If logged in and not visiting a link, go to appropriate dashboard
                  if (currentUserFromStorage?.role === UserRole.ADMIN) {
                      setView('admin');
                  } else {
                      setView('dashboard');
                  }
              } else {
                  // If not logged in and no shared link, stay on landing page
                  setView('landing');
              }
          }

      } catch (err) {
          console.error("Failed to load data from backend", err);
          // Could fall back to localStorage here if offline support is needed
      }
  };

  useEffect(() => {
    loadInitialData();

    // Google Auth Init
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

    if (window.google) {
        initGoogle();
    } else {
        const interval = setInterval(() => {
            if (window.google) {
                initGoogle();
                clearInterval(interval);
            }
        }, 200);
        setTimeout(() => clearInterval(interval), 10000);
    }
  }, []);

  const handleGoogleResponse = async (response: any) => {
      try {
          const decoded: any = jwtDecode(response.credential);
          const email = decoded.email;
          const name = decoded.name;
          
          // Refresh users from DB
          const users = await api.fetchUsers();
          setAllUsers(users);
          
          let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

          if (!user) {
             const isAdmin = email.toLowerCase() === (env.VITE_ADMIN_EMAIL || '').toLowerCase();
             user = {
                 id: `user-${Date.now()}`,
                 name: name,
                 email: email,
                 role: isAdmin ? UserRole.ADMIN : UserRole.USER,
                 tier: isAdmin ? TierLevel.PRO : TierLevel.FREE,
                 storageUsedMb: 0,
                 storageLimitMb: isAdmin ? Infinity : TIER_CONFIG[TierLevel.FREE].storageLimitMb,
                 joinedDate: new Date().toISOString().split('T')[0]
             };
             user = await api.createUser(user);
             setAllUsers(prev => [...prev, user!]);
          } else {
               const isAdmin = email.toLowerCase() === (env.VITE_ADMIN_EMAIL || '').toLowerCase();
               if (isAdmin && user.role !== UserRole.ADMIN) {
                   user = { ...user, role: UserRole.ADMIN, tier: TierLevel.PRO, storageLimitMb: Infinity };
                   await api.updateUser(user);
               }
          }

          setCurrentUser(user);
          localStorage.setItem('snapify_user_id', user.id);
          setView(user.role === UserRole.ADMIN ? 'admin' : 'dashboard');
      } catch (error) {
          console.error("Google Login Error", error);
          setAuthError(t('authErrorInvalid'));
      }
  };

  const incrementEventViews = async (id: string, currentEvents: Event[]) => {
      const updated = currentEvents.map(e => {
          if (e.id === id) return { ...e, views: (e.views || 0) + 1 };
          return e;
      });
      setEvents(updated);
      
      const evt = currentEvents.find(e => e.id === id);
      if (evt) {
          await api.updateEvent({ ...evt, views: (evt.views || 0) + 1 });
      }
  };

  // -- Translations --
  useEffect(() => { localStorage.setItem('snapify_lang', language); }, [language]);
  const t: TranslateFn = (key: string) => {
    return TRANSLATIONS[language][key] || TRANSLATIONS['en'][key] || key;
  };
  const changeLanguage = (lang: Language) => {
      setLanguage(lang);
  };

  // -- Computed Properties --
  const activeEvent = events.find(e => e.id === currentEventId);
  const isOwner = currentUser && activeEvent && currentUser.id === activeEvent.hostId;
  const isEventExpired = activeEvent?.expiresAt ? new Date() > new Date(activeEvent.expiresAt) : false;
  const hostUser = allUsers.find(u => u.id === activeEvent?.hostId);
  const isHostPhotographer = hostUser?.role === UserRole.PHOTOGRAPHER;

  // -- Auth Handlers --

  const handleEmailAuth = async (data: any, isSignUp: boolean) => {
    if (isLoggingIn) return;
    setAuthError('');
    setIsLoggingIn(true);
    
    try {
        if (isSignUp) {
            const { email, password, name, isPhotographer, studioName } = data;
            if (allUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
                setAuthError(t('authErrorEmail'));
                setIsLoggingIn(false);
                return;
            }
            
            const tier = TierLevel.FREE;
            const config = TIER_CONFIG[tier];
            const isAdmin = email.toLowerCase() === (env.VITE_ADMIN_EMAIL || '').toLowerCase();

            const newUser: User = {
                id: `user-${Date.now()}`,
                name: name,
                email: email,
                role: isAdmin ? UserRole.ADMIN : (isPhotographer ? UserRole.PHOTOGRAPHER : UserRole.USER),
                tier: isAdmin ? TierLevel.PRO : tier,
                storageUsedMb: 0,
                storageLimitMb: isAdmin ? Infinity : config.storageLimitMb,
                joinedDate: new Date().toISOString().split('T')[0],
                studioName: isAdmin ? undefined : (isPhotographer ? studioName : undefined)
            };
            const created = await api.createUser(newUser);
            setAllUsers(prev => [...prev, created]);
            setCurrentUser(created);
            localStorage.setItem('snapify_user_id', created.id);
            setView(isAdmin ? 'admin' : 'dashboard');

        } else {
            const { email, password } = data;
            const isAdminEmail = email.toLowerCase() === (env.VITE_ADMIN_EMAIL || '').toLowerCase();
            if (isAdminEmail && env.VITE_ADMIN_PASSWORD) {
                if (password !== env.VITE_ADMIN_PASSWORD) {
                    setAuthError(t('authErrorInvalid'));
                    setIsLoggingIn(false);
                    return;
                }
            }

            const foundUser = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (foundUser) {
                // Fetch events based on user role
                let userEvents: Event[];
                if (foundUser.role === UserRole.ADMIN) {
                    userEvents = await api.fetchEvents(); // Fetch all events for admin
                } else {
                    userEvents = await api.fetchEvents(foundUser.id); // Only user's events
                }
                setEvents(userEvents);
                
                setCurrentUser(foundUser);
                localStorage.setItem('snapify_user_id', foundUser.id);
                setView(foundUser.role === UserRole.ADMIN ? 'admin' : 'dashboard');
            } else {
                setAuthError(t('authErrorInvalid'));
            }
        }
    } catch (e) {
        setAuthError("Server Error");
    }
    setIsLoggingIn(false);
  };

  // Updated Guest Login to persist name in localStorage
  const handleGuestLogin = (name: string) => {
    setGuestName(name);
    localStorage.setItem('snapify_guest_name', name);
    setShowGuestLogin(false);
    if (pendingAction === 'camera') {
      setIsCameraOpen(true);
    } else if (pendingAction === 'upload') {
      fileInputRef.current?.click();
    }
    setPendingAction(null);
  };

  // -- Event Logic --

  const handleCreateEvent = async (data: any) => {
    if (!currentUser) return;

    const { title, date, theme, description, adminOptions } = data;
    let expiresAt: string | null = null;
    const now = new Date().getTime();

    if (currentUser.role === UserRole.ADMIN && adminOptions) {
        const { expiryType, durationValue, durationUnit } = adminOptions;
        if (expiryType === 'unlimited') {
            expiresAt = null;
        } else if (expiryType === 'custom') {
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
        if (config.maxDurationDays === null) {
            expiresAt = null;
        } else if (currentUser.tier === TierLevel.FREE && config.maxDurationHours) {
            expiresAt = new Date(now + config.maxDurationHours * 60 * 60 * 1000).toISOString();
        } else {
            expiresAt = new Date(now + (config.maxDurationDays || 30) * 24 * 60 * 60 * 1000).toISOString();
        }
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
      views: 0,
      downloads: 0
    };

    const created = await api.createEvent(newEvent);
    setEvents(prev => [created, ...prev]);
    setShowCreateModal(false);
    setCurrentEventId(created.id);
    setView('event');
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
      
      // Optimistic UI update
      setEvents(prev => prev.map(e => {
          if (e.id === currentEventId) {
              return {
                  ...e,
                  media: e.media.map(m => {
                      if (m.id === item.id) {
                          return { ...m, likes: (m.likes || 0) + 1 };
                      }
                      return m;
                  })
              };
          }
          return e;
      }));
      
      await api.likeMedia(item.id);
  };

  const handleDeleteEvent = async (id: string) => {
      await api.deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      if (currentEventId === id) {
          setCurrentEventId(null);
      }
  };

  // -- User Management --

  const handleUpdateUserTier = async (userId: string, newTier: TierLevel) => {
      const user = allUsers.find(u => u.id === userId);
      if (user) {
          const updated = { ...user, tier: newTier, storageLimitMb: TIER_CONFIG[newTier].storageLimitMb };
          await api.updateUser(updated);
          setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
          if (currentUser && currentUser.id === userId) setCurrentUser(updated);
      }
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
      const user = allUsers.find(u => u.id === userId);
      if (user) {
          const updated = { ...user, role: newRole };
          await api.updateUser(updated);
          setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
          if (currentUser && currentUser.id === userId) setCurrentUser(updated);
      }
  };

  const handleUpdateStudioSettings = async (updates: Partial<User>) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, ...updates };
    await api.updateUser(updatedUser);
    setCurrentUser(updatedUser);
    setAllUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
  };

  // -- Media & Upload --

  const initiateMediaAction = (action: 'upload' | 'camera') => {
    // Check if user is logged in OR if a guest session is persisted
    if (currentUser || guestName) {
      if (action === 'camera') setIsCameraOpen(true);
      else fileInputRef.current?.click();
    } else {
      setPendingAction(action);
      setShowGuestLogin(true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !activeEvent) return;
    
    const uploader = currentUser ? (currentUser.studioName || currentUser.name) : guestName || "Guest";
    const file = e.target.files[0];
    const fileSizeMb = file.size / (1024 * 1024);
    
    if (currentUser) {
        if (currentUser.storageUsedMb + fileSizeMb > currentUser.storageLimitMb) {
            alert(t('storageLimit'));
            return;
        }
    }

    const type = file.type.startsWith('video') ? 'video' : 'image';

    if (type === 'video' && currentUser) {
        const config = getTierConfigForUser(currentUser);
        if (!config.allowVideo) {
            alert(t('videoRestricted'));
            return;
        }
    }

    // Process Image for Watermark / Caption
    const reader = new FileReader();
    reader.onload = async (event) => {
        let processedFile = file;
        let result = event.target?.result as string;
        let caption = '';
        
        if (type === 'image') {
            caption = await generateImageCaption(result);
        }

        const config = currentUser ? getTierConfigForUser(currentUser) : TIER_CONFIG[TierLevel.FREE];
        const canWatermark = currentUser?.role === UserRole.PHOTOGRAPHER && config.allowWatermark;
        const shouldWatermark = applyWatermarkState && canWatermark;

        if (shouldWatermark && type === 'image' && currentUser) {
             // Apply watermark via canvas
             const watermarkedDataUrl = await applyWatermark(
                 result, 
                 currentUser.studioName || null,
                 currentUser.logoUrl || null,
                 currentUser.watermarkOpacity,
                 currentUser.watermarkSize,
                 currentUser.watermarkPosition,
                 currentUser.watermarkOffsetX,
                 currentUser.watermarkOffsetY
             );
             // Convert base64 back to file for upload
             const res = await fetch(watermarkedDataUrl);
             const blob = await res.blob();
             processedFile = new File([blob], file.name, { type: 'image/jpeg' });
        }

        // Upload to Backend
        const metadata: Partial<MediaItem> = {
            id: `media-${Date.now()}`,
            type,
            caption,
            uploadedAt: new Date().toISOString(),
            uploaderName: uploader,
            isWatermarked: shouldWatermark,
            watermarkText: currentUser?.studioName
        };

        const uploadedMedia = await api.uploadMedia(processedFile, metadata, activeEvent.id);

        setEvents(prev => prev.map(ev => {
            if (ev.id === activeEvent.id) {
                return { ...ev, media: [uploadedMedia, ...ev.media] };
            }
            return ev;
        }));

        if (currentUser) {
            updateUserStorage(currentUser.id, fileSizeMb);
        }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = async (imageSrc: string) => {
    if (!activeEvent) return;
    const sizeMb = (imageSrc.length * (3/4)) / (1024*1024);

    if (currentUser) {
        if (currentUser.storageUsedMb + sizeMb > currentUser.storageLimitMb) {
            alert(t('storageLimit'));
            setIsCameraOpen(false);
            return;
        }
    }
    setIsCameraOpen(false);

    const uploader = currentUser ? (currentUser.studioName || currentUser.name) : guestName || "Guest";
    const caption = await generateImageCaption(imageSrc);
    
    const config = currentUser ? getTierConfigForUser(currentUser) : TIER_CONFIG[TierLevel.FREE];
    const canWatermark = currentUser?.role === UserRole.PHOTOGRAPHER && config.allowWatermark;
    const shouldWatermark = applyWatermarkState && canWatermark;
    
    let finalImageSrc = imageSrc;
    if (shouldWatermark && currentUser) {
         finalImageSrc = await applyWatermark(
               imageSrc, 
               currentUser.studioName || null,
               currentUser.logoUrl || null,
               currentUser.watermarkOpacity,
               currentUser.watermarkSize,
               currentUser.watermarkPosition,
               currentUser.watermarkOffsetX,
               currentUser.watermarkOffsetY
         );
    }

    const metadata: Partial<MediaItem> = {
        id: `cam-${Date.now()}`,
        type: 'image',
        caption,
        uploadedAt: new Date().toISOString(),
        uploaderName: uploader,
        isWatermarked: shouldWatermark,
        watermarkText: currentUser?.studioName
    };

    const uploadedMedia = await api.uploadBase64Media(finalImageSrc, metadata, activeEvent.id);

    setEvents(prev => prev.map(ev => {
      if (ev.id === activeEvent.id) {
        return { ...ev, media: [uploadedMedia, ...ev.media] };
      }
      return ev;
    }));

    if (currentUser) {
       updateUserStorage(currentUser.id, sizeMb);
    }
  };

  const updateUserStorage = async (userId: string, mb: number) => {
     const user = allUsers.find(u => u.id === userId);
     if (user) {
         const newUsed = user.storageUsedMb + mb;
         const updated = { ...user, storageUsedMb: newUsed };
         await api.updateUser(updated);
         
         setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
         if (currentUser && currentUser.id === userId) setCurrentUser(updated);
     }
  };

  const handleDeleteMedia = async (eventId: string, mediaId: string) => {
      await api.deleteMedia(mediaId);
      setEvents(prev => prev.map(e => {
          if (e.id === eventId) {
              return {
                  ...e,
                  media: e.media.filter(m => m.id !== mediaId)
              }
          }
          return e;
      }));
  };

  // Updated Download Logic (Backend-aware)
  // Accepts optional media override from EventGallery which has the freshest state from sockets
  const downloadEventZip = async (targetEvent: Event) => {
      if (!targetEvent || targetEvent.media.length === 0) return;
      
      setDownloadingZip(true);
      try {
          const zip = new JSZip();
          const folder = zip.folder(targetEvent.title.replace(/[^a-z0-9]/gi, '_'));
          
          const eventHost = allUsers.find(u => u.id === targetEvent.hostId);
          const isFreeTier = !eventHost || eventHost.tier === TierLevel.FREE;

          // Helper to fetch URL as blob/base64
          const fetchFile = async (url: string) => {
               // Handle relative URL from server
               const fetchUrl = url.startsWith('http') || url.startsWith('data:') ? url : `${(env.VITE_API_URL || '')}${url}`;
               const res = await fetch(fetchUrl);
               return res.blob();
          };

          // Helper blob to base64
          const blobToBase64 = (blob: Blob): Promise<string> => {
              return new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
              });
          };

          for (const item of targetEvent.media) {
              const filename = `${item.id}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
              
              // Skip if URL is empty (processing video not yet ready and not caught by socket)
              if (!item.url) continue;

              let blob = await fetchFile(item.url);
              
              // Watermark logic for Free Tier Downloads
              if (isFreeTier && item.type === 'image') {
                  try {
                      const base64 = await blobToBase64(blob);
                      const watermarkedDataUrl = await applyWatermark(
                          base64, "SnapifY", null, 0.5, 30, 'center', 0, 0
                      );
                      // Convert back to base64 data (strip prefix)
                      const cleanData = watermarkedDataUrl.split(',')[1];
                      if (folder) folder.file(filename, cleanData, { base64: true });
                      continue; // Skip default add
                  } catch (e) {
                      console.warn("Failed to watermark image for zip", e);
                  }
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


  // -- Render --

  if (view === 'landing') {
    return (
      <>
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
        {showContactModal && <ContactModal onClose={() => setShowContactModal(false)} t={t} />}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {view === 'admin' && currentUser?.role === UserRole.ADMIN ? (
         <AdminDashboard 
            users={allUsers}
            events={events}
            onClose={() => setView('admin')}
            onDeleteUser={async (id) => { await api.deleteUser(id); setAllUsers(prev => prev.filter(u => u.id !== id)); }}
            onDeleteEvent={handleDeleteEvent}
            onDeleteMedia={handleDeleteMedia}
            onUpdateEvent={handleUpdateEvent}
            onUpdateUserTier={handleUpdateUserTier}
            onUpdateUserRole={handleUpdateUserRole}
            onNewEvent={() => setShowCreateModal(true)}
            onDownloadEvent={downloadEventZip}
            t={t}
         />
      ) : (
        <>
        <Navigation 
          currentUser={currentUser}
          guestName={guestName}
          view={view}
          language={language}
          onChangeLanguage={changeLanguage}
          onLogout={() => {
            setCurrentUser(null);
            setView('landing');
            localStorage.removeItem('snapify_user_id');
          }}
          onHome={() => {
            setCurrentEventId(null);
            if (currentUser) {
              if (currentUser.role === UserRole.ADMIN) {
                setView('admin');
              } else {
                setView('dashboard');
              }
            } else {
              setView('landing');
            }
          }}
          onOpenSettings={() => setShowStudioSettings(true)}
          t={t}
        />

        {view === 'dashboard' && currentUser && (
            <UserDashboard 
              events={events}
              currentUser={currentUser}
              onNewEvent={() => setShowCreateModal(true)}
              onSelectEvent={(id) => { setCurrentEventId(id); setView('event'); }}
              t={t}
            />
        )}

        {view === 'event' && activeEvent && (
            <EventGallery 
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
              t={t}
            />
        )}
        </>
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
      {isCameraOpen && <CameraCapture onClose={() => setIsCameraOpen(false)} onCapture={handleCameraCapture} t={t} />}
      {showContactModal && <ContactModal onClose={() => setShowContactModal(false)} t={t} />}
      {showGuestLogin && <GuestLoginModal onLogin={handleGuestLogin} onCancel={() => setShowGuestLogin(false)} t={t} />}
      {showCreateModal && currentUser && <CreateEventModal currentUser={currentUser} onClose={() => setShowCreateModal(false)} onCreate={handleCreateEvent} t={t} />}
      {showStudioSettings && currentUser && <StudioSettingsModal currentUser={currentUser} onClose={() => setShowStudioSettings(false)} onSave={handleUpdateStudioSettings} t={t} />}
    </div>
  );
}