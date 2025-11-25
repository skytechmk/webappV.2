import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { User, UserRole, TierLevel, Event, TranslateFn, MediaItem, TIER_CONFIG } from '../types';
import { Trash2, HardDrive, Zap, Calendar, Image as ImageIcon, X, Clock, Eye, Plus, Edit, Save, Camera, Briefcase, AlertTriangle, ZoomIn, Download, Lock, ArrowLeft, LogOut, Mail, Building, ShieldAlert, Users, LayoutGrid, Settings, Crown, Star, RefreshCw, Bell, Check } from 'lucide-react';
import { api } from '../services/api';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { socketService } from '../services/socketService'; // Import socket service

interface AdminDashboardProps {
  users: User[];
  events: Event[];
  onDeleteUser: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  onDeleteMedia: (eventId: string, mediaId: string) => void;
  onUpdateEvent: (event: Event) => void;
  onUpdateUser: (user: User) => void;
  onNewEvent: () => void;
  onDownloadEvent: (event: Event) => void;
  onClose: () => void;
  onLogout: () => void;
  t: TranslateFn;
}

type Tab = 'users' | 'events' | 'userEvents' | 'settings' | 'system';

interface DeleteConfirmationState {
  isOpen: boolean;
  type: 'user' | 'event' | 'media' | 'system';
  id: string;
  parentId?: string; 
  title: string;
  message: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  users, 
  events, 
  onDeleteUser, 
  onDeleteEvent, 
  onDeleteMedia,
  onUpdateEvent,
  onUpdateUser,
  onNewEvent,
  onDownloadEvent,
  onClose,
  onLogout,
  t
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  
  // PWA Update Hook
  const {
    updateServiceWorker,
  } = useRegisterSW();
  
  // Selection State
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedUserForEvents, setSelectedUserForEvents] = useState<User | null>(null);
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);
  
  // Modal/Action State
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // System Storage State
  const [systemStorage, setSystemStorage] = useState<{
      system: { filesystem: string; size: string; used: string; available: string; usePercent: string };
      minio: { filesystem: string; size: string; used: string; available: string; usePercent: string };
      timestamp: string;
  } | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  // Event Edit State
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editExpiryType, setEditExpiryType] = useState<'unlimited' | 'custom' | 'immediate'>('custom');
  const [editDurationVal, setEditDurationVal] = useState<number>(30);
  const [editDurationUnit, setEditDurationUnit] = useState<'seconds' | 'minutes' | 'hours' | 'days'>('minutes');
  
  // User Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserStudio, setEditUserStudio] = useState('');
  const [selectedTier, setSelectedTier] = useState<TierLevel>(TierLevel.FREE);
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.USER);

  const storageData = users.map(u => ({
    name: u.name.split(' ')[0],
    used: u.storageUsedMb,
    limit: u.storageLimitMb
  }));

  // Fetch system storage data when System tab is active
  useEffect(() => {
    if (activeTab === 'system' && !systemStorage) {
      const fetchStorageData = async () => {
        setStorageLoading(true);
        try {
          const data = await api.getSystemStorage();
          setSystemStorage(data);
        } catch (error) {
          console.error('Failed to fetch storage data:', error);
        } finally {
          setStorageLoading(false);
        }
      };
      fetchStorageData();
    }
  }, [activeTab, systemStorage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewMedia) setPreviewMedia(null);
        else if (editingEvent) setEditingEvent(null);
        else if (editingUser) setEditingUser(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewMedia, editingEvent, editingUser]);

  // Socket listener for upgrade requests
  useEffect(() => {
    socketService.connect();

    const handleUpgradeRequest = (notification: any) => {
      setNotifications(prev => [notification, ...prev]);
      // Show browser notification if supported
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Upgrade Request', {
          body: `${notification.userInfo?.name || 'Anonymous user'} requested upgrade to ${notification.tier}`,
          icon: '/icon-192x192.png'
        });
      }
    };

    socketService.on('upgrade_request', handleUpgradeRequest);

    return () => {
      socketService.off('upgrade_request', handleUpgradeRequest);
    };
  }, []);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showNotifications && !(event.target as Element).closest('.notification-container')) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  // --- Helpers ---
  const getEventHostName = (hostId: string) => {
    return users.find(u => u.id === hostId)?.name || t('unknownUser');
  };

  const isExpired = (dateStr: string | null) => {
    if (!dateStr) return false;
    return new Date() > new Date(dateStr);
  };

  const getUserEvents = (userId: string) => {
    return events.filter(event => event.hostId === userId);
  };

  const getUserEventCount = (userId: string) => {
    return events.filter(e => e.hostId === userId).length;
  };

  const renderTierBadge = (tier: TierLevel) => {
    let badgeColor = 'bg-green-50 text-green-700 border-green-200';
    let icon = null;

    if (tier === TierLevel.STUDIO) {
        badgeColor = 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-900 border-amber-300';
        icon = <Crown size={10} className="mr-1 fill-amber-700" />;
    } else if (tier === TierLevel.PRO) {
        badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
        icon = <Zap size={10} className="mr-1 fill-purple-500" />;
    } else if (tier === TierLevel.BASIC) {
        badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
        icon = <Star size={10} className="mr-1 fill-blue-500" />;
    } else {
        // FREE
        badgeColor = 'bg-slate-100 text-slate-600 border-slate-200';
    }

    return (
        <span className={`px-2.5 py-1 inline-flex items-center text-xs leading-5 font-bold rounded-full border ${badgeColor}`}>
            {icon}
            {tier}
        </span>
    );
  };

  const promptDeleteUser = (user: User) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'user',
      id: user.id,
      title: 'Delete User Account',
      message: `Are you sure you want to delete ${user.name}? This will permanently remove their account AND all ${getUserEventCount(user.id)} events associated with them.`
    });
  };

  const promptDeleteEvent = (event: Event) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'event',
      id: event.id,
      title: 'Delete Event',
      message: `Are you sure you want to delete "${event.title}"? This will permanently delete the event gallery and all ${event.media.length} media items inside it.`
    });
  };

  const promptDeleteMedia = (eventId: string, mediaId: string) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'media',
      id: mediaId,
      parentId: eventId,
      title: 'Delete Media Item',
      message: 'Are you sure you want to delete this photo/video? It will be permanently removed from the gallery.'
    });
  };

  const promptResetSystem = () => {
      setDeleteConfirmation({
          isOpen: true,
          type: 'system',
          id: 'system-reset',
          title: '⚠️ DANGER: RESET SYSTEM',
          message: 'Are you absolutely sure? This will WIPE ALL DATA (Users, Events, Photos, Videos) from the database and storage. This action cannot be undone. You will be logged out.'
      });
  };

  const executeDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, id, parentId } = deleteConfirmation;
    
    if (type === 'system') {
        setIsResetting(true);
        try {
            await api.resetSystem();
            alert("System reset successful. Refreshing...");
            onLogout();
            window.location.reload();
        } catch (error: any) {
            alert("Failed to reset system: " + (error.message || error));
            setIsResetting(false);
        }
        return;
    }

    if (type === 'user') {
      onDeleteUser(id);
    } else if (type === 'event') {
      onDeleteEvent(id);
      if (selectedEvent?.id === id) {
        setSelectedEvent(null);
      }
    } else if (type === 'media' && parentId) {
      onDeleteMedia(parentId, id);
      setSelectedEvent(prev => prev ? ({
        ...prev,
        media: prev.media.filter(m => m.id !== id)
      }) : null);
      
      if (previewMedia?.id === id) {
        setPreviewMedia(null);
      }
    }
    setDeleteConfirmation(null);
  };

  const openEditModal = (evt: Event) => {
    setEditingEvent(evt);
    setEditTitle(evt.title);
    if (!evt.expiresAt) {
        setEditExpiryType('unlimited');
    } else {
        setEditExpiryType('custom');
        setEditDurationVal(30);
        setEditDurationUnit('minutes');
    }
  };

  const handleSaveEventEdit = () => {
      if (!editingEvent) return;
      let newExpiresAt: string | null = editingEvent.expiresAt;
      if (editExpiryType === 'unlimited') {
          newExpiresAt = null;
      } else if (editExpiryType === 'immediate') {
          newExpiresAt = new Date().toISOString();
      } else {
          const now = new Date().getTime();
          let multiplier = 1000; 
          if (editDurationUnit === 'minutes') multiplier = 60 * 1000;
          if (editDurationUnit === 'hours') multiplier = 60 * 60 * 1000;
          if (editDurationUnit === 'days') multiplier = 24 * 60 * 60 * 1000;
          newExpiresAt = new Date(now + (editDurationVal * multiplier)).toISOString();
      }
      const updatedEvent: Event = {
          ...editingEvent,
          title: editTitle,
          expiresAt: newExpiresAt
      };
      onUpdateEvent(updatedEvent);
      setEditingEvent(null);
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserEmail(user.email);
    setEditUserStudio(TIER_CONFIG[user.tier].allowBranding ? (user.studioName || '') : '');
    setSelectedTier(user.tier);
    setSelectedRole(user.role);
  };

  const handleSaveUserEdit = () => {
    if (!editingUser) return;

    const config = TIER_CONFIG[selectedTier];
    const updatedUser: User = {
        ...editingUser,
        name: editUserName,
        email: editUserEmail,
        studioName: config.allowBranding ? editUserStudio : undefined,
        role: selectedRole,
        tier: selectedTier
    };

    onUpdateUser(updatedUser);
    setEditingUser(null);
  };

  const viewUserEvents = (user: User) => {
    setSelectedUserForEvents(user);
    setActiveTab('userEvents');
  };

  const backToUsers = () => {
    setSelectedUserForEvents(null);
    setActiveTab('users');
  };

  // UPDATED: Enhanced Force Update Handler
  const handleForceUpdate = async () => {
      if (confirm("Force update app to latest version? This will unregister all service workers and reload the page.")) {
          
          // 1. Try the plugin method first
          try {
             await updateServiceWorker(true);
          } catch (e) { console.error(e); }

          // 2. Manually unregister all service workers (The nuclear option)
          if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const registration of registrations) {
                  await registration.unregister();
              }
          }

          // 3. Force reload from server (ignoring cache)
          window.location.reload();
      }
  };

  // NEW: Handle Global Client Reload
  const handleGlobalClientReload = () => {
      if (confirm("⚠️ FORCE RELOAD ALL CLIENTS?\n\nThis will cause every user currently on the site to refresh their page immediately. Use this only after pushing a critical update.")) {
          const token = localStorage.getItem('snapify_token');
          if (token) {
              // Emit event via socket service
              if (socketService.socket) {
                  socketService.socket.emit('admin_trigger_reload', token);
                  alert("Signal sent. Clients should reload momentarily.");
              } else {
                  alert("Socket not connected.");
              }
          }
      }
  };

  const renderUserEvents = () => {
    if (!selectedUserForEvents) return null;
    const userEvents = getUserEvents(selectedUserForEvents.id);
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50">
          <button 
            onClick={backToUsers}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back to Users
          </button>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {selectedUserForEvents.name}'s Events
            </h3>
            <p className="text-xs text-slate-500">
              {userEvents.length} events found
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Event</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Media</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {userEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-bold text-slate-900 flex items-center gap-1">
                        {evt.title}
                        {evt.pin && <Lock size={12} className="text-amber-500" />}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <Calendar size={12} /> {evt.date || t('noDate')}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {isExpired(evt.expiresAt) ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 flex items-center w-fit border border-red-200">
                        <Clock size={12} className="mr-1" /> {t('expired')}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 flex items-center w-fit border border-green-200">
                        <Zap size={12} className="mr-1" /> {t('active')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">
                    {evt.media.length} {t('items')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                    <button onClick={() => onDownloadEvent(evt)} className="text-green-600 hover:bg-green-50 p-2 rounded-lg transition-colors" title={t('downloadAll')}>
                      <Download size={18} />
                    </button>
                    <button onClick={() => openEditModal(evt)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors" title="Edit Event">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => setSelectedEvent(evt)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors" title="View Media">
                      <Eye size={18} />
                    </button>
                    <button onClick={() => promptDeleteEvent(evt)} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Delete Event">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {userEvents.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              <Calendar size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="font-medium">No events found for this user</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => {
      return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in duration-300">
              <div className="max-w-3xl mx-auto">
                  <div className="text-center mb-10">
                      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                          <ShieldAlert className="text-red-600" size={40} />
                      </div>
                      <h2 className="text-3xl font-black text-slate-900 mb-2">System Settings</h2>
                      <p className="text-slate-500">
                          Manage global configurations and perform critical maintenance tasks.
                      </p>
                  </div>

                  <div className="space-y-6">
                      {/* Force Update Card */}
                      <div className="border border-indigo-200 rounded-2xl p-6 bg-indigo-50/50 flex items-center justify-between">
                          <div>
                              <h4 className="text-lg font-bold text-indigo-900 mb-1 flex items-center gap-2">
                                  <RefreshCw size={18}/> App Updates
                              </h4>
                              <p className="text-sm text-indigo-700">
                                  Force this browser to fetch the latest version of the application immediately.
                              </p>
                          </div>
                          <button
                              onClick={handleForceUpdate}
                              className="py-2.5 px-5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2"
                          >
                              <RefreshCw size={16} />
                              Force Reload App
                          </button>
                      </div>

                      {/* NEW: Global Client Force Reload Card */}
                      <div className="border border-amber-200 rounded-2xl p-6 bg-amber-50/50 flex items-center justify-between">
                          <div>
                              <h4 className="text-lg font-bold text-amber-900 mb-1 flex items-center gap-2">
                                  <Zap size={18}/> Global Client Refresh
                              </h4>
                              <p className="text-sm text-amber-700 max-w-md">
                                  Send a signal to <strong>ALL connected users</strong> to unregister their service worker and reload the page. Use this after deploying a new version to ensure everyone gets it immediately.
                              </p>
                          </div>
                          <button
                              onClick={handleGlobalClientReload}
                              className="py-2.5 px-5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all shadow-md flex items-center gap-2"
                          >
                              <RefreshCw size={16} />
                              Reload All Clients
                          </button>
                      </div>

                      {/* Reset Card */}
                      <div className="border border-red-200 rounded-2xl p-8 bg-red-50/50 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                              <AlertTriangle size={120} className="text-red-500" />
                          </div>
                          <div className="relative z-10">
                              <h4 className="text-xl font-bold text-red-900 mb-2 flex items-center gap-2">
                                  <Trash2 size={20}/> Danger Zone
                              </h4>
                              <p className="text-sm text-red-700 mb-6 max-w-xl leading-relaxed">
                                  Performs a hard reset of the entire SnapifY instance. This action will irreversibly delete
                                  <strong> ALL</strong> users, events, photos, videos, and comments from the database and clear
                                  all files from storage.
                              </p>
                              <button
                                  onClick={promptResetSystem}
                                  className="py-3 px-6 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 flex items-center gap-2"
                              >
                                  <ShieldAlert size={18} />
                                  Reset System Database
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  const renderSystem = () => {
      return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in duration-300">
              <div className="max-w-4xl mx-auto">
                  <div className="text-center mb-10">
                      <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
                          <HardDrive className="text-green-600" size={40} />
                      </div>
                      <h2 className="text-3xl font-black text-slate-900 mb-2">System Storage</h2>
                      <p className="text-slate-500">
                          Real-time monitoring of system and storage capacity.
                      </p>
                  </div>

                  <div className="space-y-6">
                      {/* System Storage Card */}
                      <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                          <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                              <HardDrive size={18} /> System Disk Usage
                          </h4>
                          {storageLoading ? (
                              <div className="flex items-center justify-center py-8">
                                  <div className="animate-spin border-2 border-slate-300 border-t-slate-600 rounded-full w-8 h-8"></div>
                                  <span className="ml-3 text-slate-600">Loading storage info...</span>
                              </div>
                          ) : systemStorage ? (
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Filesystem</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.system.filesystem}</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Size</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.system.size}</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Used</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.system.used}</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Available</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.system.available}</div>
                                  </div>
                              </div>
                          ) : (
                              <div className="text-center py-8 text-slate-500">
                                  <HardDrive size={48} className="mx-auto mb-4 text-slate-300" />
                                  <p>Unable to load storage information</p>
                              </div>
                          )}
                      </div>

                      {/* MinIO Storage Card */}
                      <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                          <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                              <HardDrive size={18} /> MinIO Storage Usage
                          </h4>
                          {systemStorage ? (
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Filesystem</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.minio.filesystem}</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Size</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.minio.size}</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Used</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.minio.used}</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                                      <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Available</div>
                                      <div className="text-lg font-black text-slate-900">{systemStorage.minio.available}</div>
                                  </div>
                              </div>
                          ) : (
                              <div className="text-center py-8 text-slate-500">
                                  <HardDrive size={48} className="mx-auto mb-4 text-slate-300" />
                                  <p>Unable to load MinIO information</p>
                              </div>
                          )}
                      </div>

                      {/* Last Updated */}
                      {systemStorage && (
                          <div className="text-center text-xs text-slate-400">
                              Last updated: {new Date(systemStorage.timestamp).toLocaleString()}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 py-4 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-lg shadow-indigo-200 shadow-md">
                    <Zap className="text-white" size={24} />
                </div>
                <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">SnapifY Admin</h1>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Master Control</p>
                </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                {[
                    { id: 'users', icon: Users, label: 'Users' },
                    { id: 'events', icon: Calendar, label: 'Events' },
                    { id: 'system', icon: HardDrive, label: 'System' },
                    { id: 'settings', icon: Settings, label: 'Settings' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id as Tab); setSelectedUserForEvents(null); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            activeTab === tab.id 
                            ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' 
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                        }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={onNewEvent}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-500/20 text-sm"
                >
                    <Plus size={16} />
                    <span className="hidden sm:inline">{t('newEvent')}</span>
                </button>
                <div className="h-8 w-px bg-slate-200 mx-1"></div>
                <div className="relative notification-container">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors relative"
                        title="Notifications"
                    >
                        <Bell size={20} />
                        {notifications.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                                {notifications.length > 9 ? '9+' : notifications.length}
                            </span>
                        )}
                    </button>
                    {showNotifications && (
                        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-96 overflow-y-auto notification-container">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                <h4 className="font-bold text-slate-900">Notifications</h4>
                                <button
                                    onClick={() => setNotifications([])}
                                    className="text-xs text-slate-500 hover:text-slate-700"
                                >
                                    Clear All
                                </button>
                            </div>
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-slate-500">
                                    <Bell size={32} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No notifications</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {notifications.map((notification, index) => (
                                        <div
                                            key={notification.id || index}
                                            onClick={() => {
                                                setSelectedNotification(notification);
                                                setShowUpgradeModal(true);
                                                setShowNotifications(false);
                                            }}
                                            className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <Crown size={16} className="text-indigo-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-900">
                                                        Upgrade Request
                                                    </p>
                                                    <p className="text-xs text-slate-600 mt-1">
                                                        {notification.userInfo?.name || 'Anonymous user'} → {notification.tier}
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        {new Date(notification.timestamp).toLocaleString()}
                                                    </p>
                                                </div>
                                                <div className="text-slate-400">
                                                    <Crown size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" title={t('backToApp')}>
                    <LayoutGrid size={20} />
                </button>
                <button onClick={onLogout} className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title={t('logOut')}>
                    <LogOut size={20} />
                </button>
            </div>
          </div>
      </header>

      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {/* KPI Cards - Only show on main tabs */}
          {activeTab !== 'settings' && !selectedUserForEvents && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-in slide-in-from-top-2">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('totalUsers')}</span>
                          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Users size={20} /></div>
                      </div>
                      <span className="text-4xl font-black text-slate-900">{users.length}</span>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('totalEvents')}</span>
                          <div className="p-2 bg-pink-50 rounded-lg text-pink-600"><Calendar size={20} /></div>
                      </div>
                      <span className="text-4xl font-black text-slate-900">{events.length}</span>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('storage')}</span>
                          <div className="p-2 bg-green-50 rounded-lg text-green-600"><HardDrive size={20} /></div>
                      </div>
                      <span className="text-4xl font-black text-slate-900">
                          {users.reduce((acc, curr) => acc + curr.storageUsedMb, 0).toFixed(1)} <span className="text-lg font-medium text-slate-400">MB</span>
                      </span>
                  </div>
              </div>
          )}

          {/* Content Switcher */}
           {activeTab === 'settings' ? renderSettings() :
            activeTab === 'system' ? renderSystem() :
            activeTab === 'userEvents' ? renderUserEvents() :
            activeTab === 'users' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* User List */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-900">{t('registeredUsers')}</h3>
                        <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full">{users.length}</span>
                    </div>
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider pl-8">{t('users')}</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Stats</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{t('tier')}</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider pr-8">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                            {users.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-4 pl-8 whitespace-nowrap">
                                <div className="flex items-center">
                                    <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm ${user.role === UserRole.PHOTOGRAPHER ? 'bg-slate-900 border-2 border-amber-400' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                                        {user.role === UserRole.PHOTOGRAPHER ? <Camera size={16} className="text-amber-400"/> : user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="ml-4">
                                    <div className="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-2">
                                        {user.name}
                                        {user.role === UserRole.ADMIN && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase tracking-wide">ADMIN</span>}
                                    </div>
                                    <div className="text-xs text-slate-500">{user.email}</div>
                                    </div>
                                </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-slate-700">{getUserEventCount(user.id)} Events</span>
                                        <div className="w-24 bg-slate-200 rounded-full h-1.5">
                                            <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min((user.storageUsedMb / user.storageLimitMb) * 100, 100)}%` }}></div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {renderTierBadge(user.tier)}
                                </td>
                                <td className="px-6 py-4 pr-8 whitespace-nowrap text-right text-sm font-medium">
                                {user.role !== UserRole.ADMIN && (
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => viewUserEvents(user)} className="text-slate-500 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition-colors" title="View Events"><Eye size={16} /></button>
                                        <button onClick={() => openEditUserModal(user)} className="text-slate-500 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Edit User"><Edit size={16} /></button>
                                        <button onClick={() => promptDeleteUser(user)} className="text-slate-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Delete User"><Trash2 size={16} /></button>
                                    </div>
                                )}
                                </td>
                            </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                </div>

                {/* Storage Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">{t('storageUsage')}</h3>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={storageData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 12}} />
                            <Tooltip 
                                cursor={{fill: '#f8fafc'}} 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                            />
                            <Bar dataKey="used" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} name="Used (MB)" />
                        </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900">{t('systemEvents')}</h3>
                    <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full">{events.length}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider pl-8">{t('event')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{t('host')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{t('status')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{t('mediaCount')}</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider pr-8">{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                        {events.map((evt) => (
                        <tr key={evt.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4 pl-8 whitespace-nowrap">
                            <div>
                                <div className="text-sm font-bold text-slate-900 flex items-center gap-1">
                                    {evt.title}
                                    {evt.pin && <Lock size={12} className="text-amber-500" />}
                                </div>
                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Calendar size={12} /> {evt.date || t('noDate')}</div>
                            </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                        {getEventHostName(evt.hostId).charAt(0)}
                                    </div>
                                    {getEventHostName(evt.hostId)}
                                    {users.find(u => u.id === evt.hostId)?.role === UserRole.PHOTOGRAPHER && <Briefcase size={12} className="text-amber-500" />}
                                </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                            {isExpired(evt.expiresAt) ? 
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 flex items-center w-fit border border-red-200"><Clock size={12} className="mr-1" /> {t('expired')}</span> : 
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 flex items-center w-fit border border-green-200"><Zap size={12} className="mr-1" /> {t('active')}</span>
                            }
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-bold">{evt.media.length}</td>
                            <td className="px-6 py-4 pr-8 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => onDownloadEvent(evt)} className="text-slate-500 hover:text-green-600 p-2 hover:bg-green-50 rounded-lg transition-colors" title={t('downloadAll')}><Download size={16} /></button>
                                    <button onClick={() => openEditModal(evt)} className="text-slate-500 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Event"><Edit size={16} /></button>
                                    <button onClick={() => setSelectedEvent(evt)} className="text-slate-500 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition-colors" title="View Media"><Eye size={16} /></button>
                                    <button onClick={() => promptDeleteEvent(evt)} className="text-slate-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Delete Event"><Trash2 size={16} /></button>
                                </div>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>
          )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden scale-100">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-900">Edit User Profile</h3>
                    <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Display Name</label>
                            <input type="text" value={editUserName} onChange={(e) => setEditUserName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                            <div className="flex items-center px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                                <Mail size={18} className="mr-3 text-slate-400" />
                                <input type="text" value={editUserEmail} onChange={(e) => setEditUserEmail(e.target.value)} className="bg-transparent w-full focus:outline-none font-medium" />
                            </div>
                        </div>
                        {TIER_CONFIG[selectedTier].allowBranding && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Studio / Business</label>
                                <div className="flex items-center px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900">
                                    <Building size={18} className="mr-3 text-slate-400" />
                                    <input type="text" value={editUserStudio} onChange={(e) => setEditUserStudio(e.target.value)} className="bg-transparent w-full focus:outline-none font-medium" placeholder="No studio name" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">System Role</label>
                            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as UserRole)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none font-medium cursor-pointer">
                                {Object.values(UserRole).map(role => (<option key={role} value={role}>{role}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tier Plan</label>
                            <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value as TierLevel)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none font-medium cursor-pointer">
                                {Object.values(TierLevel).map(tier => (<option key={tier} value={tier}>{tier}</option>))}
                            </select>
                        </div>
                    </div>
                    
                    <button onClick={handleSaveUserEdit} className="w-full py-4 bg-black text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 mt-4">
                        <Save size={18} />
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
      )}
      
      {/* Edit Event Modal */}
      {editingEvent && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h3 className="text-xl font-black text-slate-900">{t('editEvent')}</h3>
                      <button onClick={() => setEditingEvent(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-5">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('eventTitle')}</label>
                          <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium" />
                      </div>
                      <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                          <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center"><Clock size={16} className="mr-2"/> {t('modifyExpiration')}</label>
                          <div className="space-y-2 mb-4">
                              <label className="flex items-center p-3 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-300 transition-all">
                                  <input type="radio" name="expiryType" checked={editExpiryType === 'unlimited'} onChange={() => setEditExpiryType('unlimited')} className="w-4 h-4 text-amber-600 border-slate-300 focus:ring-amber-500" />
                                  <span className="ml-3 text-sm font-bold text-slate-900">{t('unlimited')}</span>
                                  <span className="ml-auto text-xs text-amber-600 font-medium">{t('neverExpires')}</span>
                              </label>
                              <label className="flex items-center p-3 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-300 transition-all">
                                  <input type="radio" name="expiryType" checked={editExpiryType === 'immediate'} onChange={() => setEditExpiryType('immediate')} className="w-4 h-4 text-amber-600 border-slate-300 focus:ring-amber-500" />
                                  <span className="ml-3 text-sm font-bold text-slate-900">{t('expireImmediately')}</span>
                              </label>
                              <label className="flex items-center p-3 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-300 transition-all">
                                  <input type="radio" name="expiryType" checked={editExpiryType === 'custom'} onChange={() => setEditExpiryType('custom')} className="w-4 h-4 text-amber-600 border-slate-300 focus:ring-amber-500" />
                                  <span className="ml-3 text-sm font-bold text-slate-900">{t('setNewDuration')}</span>
                              </label>
                          </div>
                          {editExpiryType === 'custom' && (
                              <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                                  <input type="number" min="1" value={editDurationVal} onChange={(e) => setEditDurationVal(parseInt(e.target.value) || 0)} className="w-1/3 px-4 py-3 border border-amber-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" />
                                  <select value={editDurationUnit} onChange={(e) => setEditDurationUnit(e.target.value as any)} className="flex-1 px-4 py-3 border border-amber-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none bg-white cursor-pointer">
                                      <option value="seconds">{t('seconds')}</option><option value="minutes">{t('minutes')}</option><option value="hours">{t('hours')}</option><option value="days">{t('days')}</option>
                                  </select>
                              </div>
                          )}
                      </div>
                      <button onClick={handleSaveEventEdit} className="w-full py-4 bg-black text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"><Save size={18} />{t('saveChanges')}</button>
                  </div>
              </div>
          </div>
      )}

      {/* Media Inspector */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-xl font-black text-slate-900">{t('managing')}: {selectedEvent.title}</h3>
                        <p className="text-sm text-slate-500 font-medium mt-1">{selectedEvent.media.length} {t('mediaItems')} • {t('totalMedia')}</p>
                    </div>
                    <button onClick={() => setSelectedEvent(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {selectedEvent.media.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400"><ImageIcon size={64} className="mb-4 opacity-50" /><p className="font-bold text-lg">{t('noMedia')}</p></div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {selectedEvent.media.map((item) => (
                                <div key={item.id} className="relative group aspect-square bg-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer border border-slate-200" onClick={() => setPreviewMedia(item)}>
                                    {item.type === 'video' ? <video src={item.previewUrl || item.url} className="w-full h-full object-cover" muted /> : <img src={item.url} alt="content" className="w-full h-full object-cover" />}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                         <div className="bg-white/20 p-2 rounded-full backdrop-blur-md text-white hover:bg-white/40 transition-colors"><ZoomIn size={20} /></div>
                                        <button onClick={(e) => { e.stopPropagation(); promptDeleteMedia(selectedEvent.id, item.id); }} className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transform hover:scale-110 transition-all shadow-lg"><Trash2 size={20} /></button>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 via-black/50 to-transparent"><p className="text-white text-xs font-medium truncate">{item.uploaderName}</p></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Media Preview */}
      {previewMedia && (
        <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewMedia(null)}>
            <button className="absolute top-6 right-6 text-white/70 hover:text-white p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all z-50" onClick={() => setPreviewMedia(null)}><X size={32} /></button>
            <div className="max-w-full max-h-full overflow-hidden flex items-center justify-center relative w-full h-full" onClick={(e) => e.stopPropagation()}>
                {previewMedia.type === 'video' ? <video src={previewMedia.url} controls autoPlay className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl ring-1 ring-white/10" /> : <img src={previewMedia.url} alt="preview" className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl ring-1 ring-white/10" />}
            </div>
            <div className="absolute bottom-10 left-0 right-0 text-center text-white pointer-events-none">
                <p className="font-black text-xl drop-shadow-lg mb-1">{previewMedia.caption || 'No caption'}</p>
                <div className="flex items-center justify-center gap-2 text-sm text-white/60 font-medium">
                    <Camera size={14} />
                    <span>Uploaded by {previewMedia.uploaderName}</span>
                    <span>•</span>
                    <span>{new Date(previewMedia.uploadedAt).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-8 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 mx-auto border border-red-100">
                {deleteConfirmation.type === 'system' ? <ShieldAlert className="text-red-600" size={32} /> : <AlertTriangle className="text-red-600" size={32} />}
            </div>
            <h3 className="text-2xl font-black text-slate-900 text-center mb-3">{deleteConfirmation.title}</h3>
            <p className="text-slate-500 text-center mb-8 text-sm leading-relaxed font-medium">{deleteConfirmation.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmation(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={executeDelete} className="flex-1 py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20">
                  {isResetting ? <span className="animate-spin border-2 border-white/30 border-t-white rounded-full w-5 h-5"></span> : <Trash2 size={18} />}
                  {deleteConfirmation.type === 'system' ? 'CONFIRM RESET' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Upgrade Modal */}
      {showUpgradeModal && selectedNotification && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 animate-in zoom-in-95">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Crown size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Upgrade User</h3>
              <p className="text-slate-500 mt-2">
                Confirm upgrade for this user
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                    <p className="text-slate-900 font-medium">{selectedNotification.userInfo?.name || 'Anonymous User'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                    <p className="text-slate-900 font-medium">{selectedNotification.userInfo?.email || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Requested Tier</label>
                    <p className="text-slate-900 font-medium">{selectedNotification.tier}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Current Tier</label>
                    <p className="text-slate-900 font-medium">{selectedNotification.userInfo?.currentTier || 'FREE'}</p>
                  </div>
                  {!selectedNotification.userInfo?.id && (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                      <p className="text-sm text-amber-800 font-medium">⚠️ Anonymous Request</p>
                      <p className="text-xs text-amber-700 mt-1">This user is not registered. You cannot upgrade anonymous users.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUpgradeModal(false);
                  setSelectedNotification(null);
                }}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                {selectedNotification.userInfo?.id ? 'Cancel' : 'Close'}
              </button>
              {selectedNotification.userInfo?.id ? (
                <button
                  onClick={async () => {
                    try {
                      await api.upgradeUser(selectedNotification.userInfo.id, selectedNotification.tier);
                      // Update the user in the local state
                      const updatedUser = users.find(u => u.id === selectedNotification.userInfo.id);
                      if (updatedUser) {
                        onUpdateUser({ ...updatedUser, tier: selectedNotification.tier as TierLevel });
                      }
                      // Remove the notification
                      setNotifications(prev => prev.filter(n => n.id !== selectedNotification.id));
                      setShowUpgradeModal(false);
                      setSelectedNotification(null);
                      alert('User upgraded successfully!');
                    } catch (error) {
                      console.error('Failed to upgrade user:', error);
                      alert('Failed to upgrade user. Please try again.');
                    }
                  }}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Crown size={16} />
                  Confirm Upgrade
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowUpgradeModal(false);
                    setSelectedNotification(null);
                  }}
                  className="flex-1 py-3 bg-slate-500 text-white font-bold rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
                  disabled
                >
                  Cannot Upgrade Anonymous User
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};