import React, { useState } from 'react';
import { Zap, Globe, Briefcase, Camera, User as UserIcon, LogOut, Settings, ChevronLeft, Shield, LogIn, Crown } from 'lucide-react';
import { User, UserRole, Language, TranslateFn, TierLevel } from '../types';

interface NavigationProps {
  currentUser: User | null;
  guestName: string;
  view: string;
  currentEventTitle?: string;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  onLogout: () => void;
  onHome: () => void;
  onBack: () => void;
  onToAdmin?: () => void; // Added prop
  onOpenSettings?: () => void;
  t: TranslateFn;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentUser,
  guestName,
  view,
  currentEventTitle,
  language,
  onChangeLanguage,
  onLogout,
  onHome,
  onBack,
  onToAdmin,
  onOpenSettings,
  t
}) => {
  const [showLangMenu, setShowLangMenu] = useState(false);
  const canAccessSettings = currentUser && (currentUser.tier === TierLevel.STUDIO || currentUser.tier === TierLevel.PRO || currentUser.role === UserRole.PHOTOGRAPHER);

  const isEventView = view === 'event';

  // Helper to render tier badge
  const renderTierBadge = (tier: TierLevel) => {
    if (tier === TierLevel.FREE) return null;
    
    let badgeColor = 'bg-indigo-100 text-indigo-700 border-indigo-200';
    let icon = null;

    if (tier === TierLevel.STUDIO) {
        badgeColor = 'bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 border-amber-300 shadow-sm';
        icon = <Crown size={10} className="mr-1 fill-amber-700" />;
    } else if (tier === TierLevel.PRO) {
        badgeColor = 'bg-purple-100 text-purple-700 border-purple-200';
        icon = <Zap size={10} className="mr-1 fill-purple-500" />;
    }

    return (
        <span className={`flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${badgeColor} ml-2`}>
            {icon}
            {tier}
        </span>
    );
  };

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 transition-all duration-200">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        
        <div className="flex items-center gap-3 overflow-hidden">
            {isEventView ? (
                <button 
                    onClick={onBack} 
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
            ) : (
                <button 
                    onClick={onHome} 
                    className="bg-indigo-600 p-1.5 rounded-lg flex-shrink-0"
                >
                    <Zap size={18} className="text-white" />
                </button>
            )}
            
            <div className="flex flex-col truncate">
                {isEventView && currentEventTitle ? (
                    <h1 className="text-lg font-bold text-slate-900 truncate leading-tight">{currentEventTitle}</h1>
                ) : (
                    <span className="text-xl font-bold text-slate-900 tracking-tight">{t('appName')}</span>
                )}
            </div>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            {/* Language */}
            <div className="relative">
                <button 
                    onClick={() => setShowLangMenu(!showLangMenu)} 
                    className="flex items-center text-sm text-slate-600 hover:text-slate-900 transition-colors p-2 rounded-md hover:bg-slate-50"
                >
                    <Globe size={18} />
                    <span className="hidden sm:inline ml-1 font-medium">{language.toUpperCase()}</span>
                </button>
                {showLangMenu && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                        <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                            {(['en', 'mk', 'tr', 'sq'] as Language[]).map(lang => (
                                <button 
                                    key={lang}
                                    onClick={() => { onChangeLanguage(lang); setShowLangMenu(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm font-medium ${language === lang ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {lang.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {currentUser ? (
            <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block mr-2">
                    <div className="text-sm font-bold text-slate-900 flex items-center justify-end">
                          {currentUser.name}
                          {renderTierBadge(currentUser.tier)}
                    </div>
                </div>

                {/* Admin Toggle */}
                {currentUser.role === UserRole.ADMIN && onToAdmin && (
                    <button
                        onClick={onToAdmin}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        title="Go to Admin Dashboard"
                    >
                        <Shield size={20} />
                    </button>
                )}

                {canAccessSettings && (
                   <button 
                      onClick={onOpenSettings}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                   >
                      <Settings size={20} />
                   </button>
                )}
                
                 <button 
                    onClick={onLogout}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors ml-1"
                    title={t('logOut')}
                >
                    <LogOut size={20} />
                </button>
            </div>
            ) : (
                <>
                    {guestName && isEventView && (
                        <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                            <UserIcon size={12} />
                            <span className="truncate max-w-[100px]">{guestName}</span>
                        </div>
                    )}
                    {/* Sign In Button for Guests */}
                    <button 
                        onClick={onLogout} // onLogout resets view to landing
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
                    >
                        <LogIn size={16} />
                        <span className="hidden sm:inline">{t('signIn')}</span>
                    </button>
                </>
            )}
        </div>
      </div>
    </header>
  );
};