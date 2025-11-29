import React, { useState } from 'react';
import { Plus, Sparkles, Zap, Clock, Calendar, Image as ImageIcon, User as UserIcon, Crown, Star, BarChart3, TrendingUp, Users, Download, Settings, Camera, Video, Palette, MessageCircle } from 'lucide-react';
import { Event, User, TranslateFn, TierLevel, UserRole } from '../types';

interface UserDashboardProps {
  events: Event[];
  currentUser: User;
  onNewEvent: () => void;
  onSelectEvent: (id: string) => void;
  onRequestUpgrade: () => void;
  t: TranslateFn;
}

type Tab = 'events' | 'support';

export const UserDashboard: React.FC<UserDashboardProps> = ({
  events,
  currentUser,
  onNewEvent,
  onSelectEvent,
  onRequestUpgrade,
  t
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('events');
  
  // Helper to render tier badge
  const renderTierBadge = (tier: TierLevel) => {
    if (tier === TierLevel.FREE) return (
        <span className="flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border bg-slate-100 text-slate-500 border-slate-200">
            FREE PLAN
        </span>
    );
    
    let badgeColor = 'bg-indigo-100 text-indigo-700 border-indigo-200';
    let icon = null;
    
    // FIX: Explicitly type 'text' as string to allow custom label assignment
    let text: string = tier;

    if (tier === TierLevel.STUDIO) {
        badgeColor = 'bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 border-amber-300 shadow-sm';
        icon = <Crown size={12} className="mr-1.5 fill-amber-700" />;
        text = 'STUDIO PLAN';
    } else if (tier === TierLevel.PRO) {
        badgeColor = 'bg-purple-100 text-purple-700 border-purple-200';
        icon = <Zap size={12} className="mr-1.5 fill-purple-500" />;
        text = 'PRO PLAN';
    } else if (tier === TierLevel.BASIC) {
        badgeColor = 'bg-blue-100 text-blue-700 border-blue-200';
        icon = <Star size={12} className="mr-1.5 fill-blue-500" />;
        text = 'BASIC PLAN';
    }

    return (
        <span className={`flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${badgeColor}`}>
            {icon}
            {text}
        </span>
    );
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-slate-900">
                {activeTab === 'events' ? t('myEvents') : 'Support & Help'}
              </h2>
              {activeTab === 'events' && renderTierBadge(currentUser.tier)}
          </div>
          <p className="text-slate-500">
            {activeTab === 'events' ? t('manageEvents') : 'Get help and contact support'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {activeTab === 'events' && currentUser.tier === TierLevel.FREE && (
              <button
                onClick={onRequestUpgrade}
                className="w-full sm:w-auto bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 px-5 py-2.5 rounded-xl font-bold flex items-center justify-center space-x-2 hover:shadow-lg hover:scale-[1.02] transition-all"
                title="Upgrade your plan"
              >
                <Crown size={20} />
                <span>{t('contactSales')}</span>
              </button>
          )}

          {activeTab === 'events' && (
            <button
              onClick={onNewEvent}
              className="w-full sm:w-auto bg-black text-white px-5 py-2.5 rounded-xl font-medium flex items-center justify-center space-x-2 hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl"
            >
              <Plus size={20} />
              <span>{t('newEvent')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'events'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Calendar size={16} />
          Events
        </button>
        <button
          onClick={() => setActiveTab('support')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'support'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <MessageCircle size={16} />
          Support
        </button>
      </div>

      {/* Content Section */}
      {activeTab === 'events' && (
        <>
          {events.length === 0 ? (
        // Empty State
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm mx-4 sm:mx-0">
          <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="text-indigo-500" size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-900">{t('noEvents')}</h3>
          <p className="text-slate-500 mb-8 max-w-xs mx-auto">{t('createFirst')}</p>
          <button 
            onClick={onNewEvent}
            className="text-indigo-600 font-bold hover:underline"
          >
            {t('createNow')}
          </button>
        </div>
      ) : (
        // Events Grid
        <div className="grid md:grid-cols-2 gap-6">
          {events
            .filter(evt => {
              // Defensive check for undefined/null events
              if (!evt || !evt.title) return false;

              const expired = evt.expiresAt ? new Date() > new Date(evt.expiresAt) : false;
              // Hide expired events for FREE, BASIC, and PRO users
              if (expired && (currentUser.tier === TierLevel.FREE || currentUser.tier === TierLevel.BASIC || currentUser.tier === TierLevel.PRO)) {
                return false;
              }
              return true;
            })
            .map(evt => {
            const expired = evt.expiresAt ? new Date() > new Date(evt.expiresAt) : false;
            const isOwned = evt.hostId === currentUser?.id;
            
            return (
              <div 
                key={evt.id}
                onClick={() => onSelectEvent(evt.id)}
                className={`bg-white p-6 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${expired ? 'border-red-100 opacity-75 grayscale-[0.5]' : 'border-slate-200 shadow-sm hover:shadow-md'}`}
              >
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <Zap size={100} />
                </div>
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl shadow-md">
                    {evt.title ? evt.title.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div className="flex gap-2">
                    {expired && (
                      <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold border border-red-200 flex items-center">
                        <Clock size={10} className="mr-1" /> {t('expired')}
                      </span>
                    )}
                    {isOwned && (
                      <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                        {t('owner')}
                      </span>
                    )}
                    {/* Admin View: Show if event belongs to another user */}
                    {!isOwned && currentUser.role === UserRole.ADMIN && (
                         <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 flex items-center">
                            <UserIcon size={10} className="mr-1" /> User Event
                         </span>
                    )}
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors relative z-10">{evt.title}</h3>
                <p className="text-sm text-slate-500 mb-4 flex items-center relative z-10">
                  <Calendar size={14} className="mr-1.5" />
                  {evt.date || t('dateTBD')}
                </p>
                <p className="text-sm text-slate-600 line-clamp-2 mb-4 relative z-10 bg-slate-50 p-3 rounded-lg">
                  {evt.description}
                </p>
                <div className="pt-4 border-t border-slate-100 flex items-center text-sm text-slate-500 font-medium">
                  <ImageIcon size={16} className="mr-2 text-indigo-500" />
                  {evt.media.length} {t('memories')}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tier-Specific Enhancements */}
      {currentUser.tier === TierLevel.PRO && (
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="text-purple-600" size={24} />
            <h3 className="text-xl font-bold text-slate-900">Analytics & Insights</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-100">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="text-purple-600" size={20} />
                <span className="text-2xl font-bold text-purple-900">{events.length}</span>
              </div>
              <p className="text-sm text-purple-700 font-medium">Total Events</p>
              <p className="text-xs text-purple-600 mt-1">Events created this month</p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-xl border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <Users className="text-blue-600" size={20} />
                <span className="text-2xl font-bold text-blue-900">
                  {events.reduce((total, event) => total + event.media.length, 0)}
                </span>
              </div>
              <p className="text-sm text-blue-700 font-medium">Total Photos</p>
              <p className="text-xs text-blue-600 mt-1">Across all events</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-100">
              <div className="flex items-center justify-between mb-2">
                <Download className="text-green-600" size={20} />
                <span className="text-2xl font-bold text-green-900">
                  {events.reduce((total, event) => total + (event.downloads || 0), 0)}
                </span>
              </div>
              <p className="text-sm text-green-700 font-medium">Downloads</p>
              <p className="text-xs text-green-600 mt-1">ZIP downloads requested</p>
            </div>
          </div>
        </div>
      )}

      {currentUser.tier === TierLevel.BASIC && (
        <div className="mt-8 space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Zap className="text-blue-600" size={24} />
              <h3 className="text-xl font-bold text-slate-900">Quick Actions</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={onNewEvent}
                className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:shadow-md transition-all"
              >
                <Plus className="text-blue-600" size={20} />
                <div className="text-left">
                  <p className="font-bold text-blue-900">Create Event</p>
                  <p className="text-sm text-blue-700">Start a new photo session</p>
                </div>
              </button>

              <button
                onClick={() => {/* TODO: Implement bulk upload */}}
                className="flex items-center gap-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100 hover:shadow-md transition-all"
              >
                <Camera className="text-green-600" size={20} />
                <div className="text-left">
                  <p className="font-bold text-green-900">Bulk Upload</p>
                  <p className="text-sm text-green-700">Upload multiple photos</p>
                </div>
              </button>
            </div>
          </div>

          {/* Premium Features Preview */}
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Crown className="text-amber-600" size={24} />
              <h3 className="text-xl font-bold text-amber-900">Unlock Premium Features</h3>
            </div>

            <p className="text-amber-700 mb-6">Upgrade to PRO for advanced features and unlimited possibilities.</p>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg">
                <Video className="text-amber-600" size={18} />
                <span className="text-sm font-medium text-amber-900">4K Video Support</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg">
                <Palette className="text-amber-600" size={18} />
                <span className="text-sm font-medium text-amber-900">Custom Branding</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg">
                <BarChart3 className="text-amber-600" size={18} />
                <span className="text-sm font-medium text-amber-900">Analytics Dashboard</span>
              </div>
            </div>

            <button
              onClick={onRequestUpgrade}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all"
            >
              Upgrade to PRO - $29.99/month
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {activeTab === 'support' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="text-indigo-600" size={32} />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Support & Help Center</h3>
            <p className="text-slate-500">Get help with your SnapifY account and events</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-slate-900">Quick Help</h4>

              <div className="space-y-3">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h5 className="font-bold text-slate-900 mb-2">How to create an event?</h5>
                  <p className="text-sm text-slate-600">Click the "New Event" button and fill in your event details. You can set custom expiration times and privacy settings.</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h5 className="font-bold text-slate-900 mb-2">Storage limits</h5>
                  <p className="text-sm text-slate-600">Free plan: 100MB, Basic: 1GB, Pro: 10GB, Studio: Unlimited. Upgrade anytime to increase your storage.</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h5 className="font-bold text-slate-900 mb-2">Video uploads</h5>
                  <p className="text-sm text-slate-600">Video support is available for Basic, Pro, and Studio plans. Maximum file size depends on your plan.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-lg font-bold text-slate-900">Contact Support</h4>

              <div className="space-y-3">
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                  <div className="flex items-center gap-3 mb-3">
                    <MessageCircle className="text-indigo-600" size={20} />
                    <h5 className="font-bold text-indigo-900">Live Chat Support</h5>
                  </div>
                  <p className="text-sm text-indigo-700 mb-3">Chat with our support team for immediate help</p>
                  <button className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-bold hover:bg-indigo-700 transition-colors">
                    Start Chat
                  </button>
                </div>

                <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                  <div className="flex items-center gap-3 mb-3">
                    <Users className="text-green-600" size={20} />
                    <h5 className="font-bold text-green-900">Community Forum</h5>
                  </div>
                  <p className="text-sm text-green-700 mb-3">Connect with other users and share tips</p>
                  <button className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-bold hover:bg-green-700 transition-colors">
                    Visit Forum
                  </button>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-center gap-3 mb-3">
                    <Crown className="text-amber-600" size={20} />
                    <h5 className="font-bold text-amber-900">Upgrade Your Plan</h5>
                  </div>
                  <p className="text-sm text-amber-700 mb-3">Get premium features and priority support</p>
                  <button
                    onClick={onRequestUpgrade}
                    className="w-full bg-amber-600 text-white py-2 px-4 rounded-lg font-bold hover:bg-amber-700 transition-colors"
                  >
                    Upgrade Now
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-900 mb-2">Need more help?</h4>
            <p className="text-sm text-slate-600">
              Check out our <a href="#" className="text-indigo-600 hover:underline">documentation</a> or
              contact us at <a href="mailto:support@snapify.com" className="text-indigo-600 hover:underline">support@snapify.com</a>
            </p>
          </div>
        </div>
      )}
    </main>
  );
};