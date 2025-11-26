import React from 'react';
import { Globe, LogOut, User, Home, Settings, ShieldCheck, ArrowLeft, Menu, X } from 'lucide-react';
import { User as UserType, UserRole, TranslateFn, Language, TIER_CONFIG } from '../types';

interface NavigationProps {
  currentUser: UserType | null;
  guestName: string;
  view: 'landing' | 'dashboard' | 'event' | 'admin' | 'live';
  currentEventTitle?: string;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  onLogout: () => void;
  onSignIn: () => void;
  onHome: () => void;
  onBack: () => void;
  onToAdmin: () => void;
  onOpenSettings: () => void;
  t: TranslateFn;
}

interface NavigationPropsExtended extends NavigationProps {
  adminStatus?: {adminId: string, online: boolean, lastSeen: number}[];
}

export const Navigation: React.FC<NavigationPropsExtended> = ({
  currentUser,
  guestName,
  view,
  currentEventTitle,
  language,
  onChangeLanguage,
  onLogout,
  onSignIn,
  onHome,
  onBack,
  onToAdmin,
  onOpenSettings,
  adminStatus = [],
  t
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const toggleMenu = () => setMenuOpen(!menuOpen);

  const renderLanguageSelector = () => (
    <div className="flex items-center bg-slate-100 rounded-lg p-1">
      <button 
        onClick={() => onChangeLanguage('en')} 
        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${language === 'en' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
      >
        EN
      </button>
      <button 
        onClick={() => onChangeLanguage('mk')} 
        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${language === 'mk' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
      >
        MK
      </button>
      <button 
        onClick={() => onChangeLanguage('sq')} 
        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${language === 'sq' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
      >
        SQ
      </button>
      <button 
        onClick={() => onChangeLanguage('tr')} 
        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${language === 'tr' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
      >
        TR
      </button>
    </div>
  );

  return (
    <nav className="px-4 py-3 md:px-8 md:py-4 max-w-7xl mx-auto flex justify-between items-center">
      <div className="flex items-center gap-3 overflow-hidden">
        {view === 'event' ? (
           <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors">
               <ArrowLeft size={20} />
           </button>
        ) : view !== 'landing' && view !== 'dashboard' && (
           <button onClick={onHome} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors">
               <Home size={20} />
           </button>
        )}
        
        <div className="flex flex-col justify-center">
            <div 
                onClick={onHome} 
                className="flex items-center gap-2 cursor-pointer select-none"
            >
                <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center font-black text-lg shadow-md">S</div>
                <span className="font-black text-xl tracking-tight text-slate-900 hidden sm:block">SnapifY</span>
                {/* NEW: Version in Header */}
                <span className="text-[10px] text-slate-400 font-mono mt-1">v2.1</span>
            </div>
            {currentEventTitle && view === 'event' && (
                <p className="text-xs font-bold text-indigo-600 truncate max-w-[150px] md:max-w-xs animate-in slide-in-from-left-2">
                    {currentEventTitle}
                </p>
            )}
        </div>
      </div>

      {/* Desktop Menu */}
      <div className="hidden md:flex items-center gap-4">
         {renderLanguageSelector()}
         
         {currentUser ? (
             <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                 {currentUser.role === UserRole.ADMIN && (
                     <button onClick={onToAdmin} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors">
                         <ShieldCheck size={16} /> Admin
                     </button>
                 )}
                 <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                         {currentUser.name.charAt(0).toUpperCase()}
                     </div>
                     <span className="text-sm font-bold text-slate-700">{currentUser.name}</span>
                 </div>
                 {TIER_CONFIG[currentUser.tier].allowBranding && <button onClick={onOpenSettings} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><Settings size={18} /></button>}
                 <button onClick={onLogout} className="p-2 text-red-400 hover:text-red-600 transition-colors"><LogOut size={18} /></button>
             </div>
         ) : (
             <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                 {guestName && <span className="text-sm font-medium text-slate-500">Hi, {guestName}</span>}
                 <button onClick={onLogout} className="text-sm font-bold text-slate-600 hover:text-slate-900">{t('logOut')}</button>
             </div>
         )}
      </div>

      {/* Mobile Menu Toggle */}
      <div className="md:hidden flex items-center gap-2">
          {currentUser && (
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm border border-indigo-200">
                  {currentUser.name.charAt(0).toUpperCase()}
              </div>
          )}
          <button onClick={toggleMenu} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-xl p-4 flex flex-col gap-4 z-50 md:hidden animate-in slide-in-from-top-5">
              <div className="flex justify-center pb-2">{renderLanguageSelector()}</div>
              
              {currentUser ? (
                  <>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                          <div className="w-10 h-10 rounded-full bg-white shadow-sm text-indigo-600 flex items-center justify-center font-bold text-lg">
                              {currentUser.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                              <p className="font-bold text-slate-900">{currentUser.name}</p>
                              <p className="text-xs text-slate-500">{currentUser.email}</p>
                          </div>
                      </div>
                      
                      {currentUser.role === UserRole.ADMIN && (
                          <button onClick={() => { onToAdmin(); setMenuOpen(false); }} className="w-full py-3 px-4 bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center gap-3">
                              <ShieldCheck size={18} /> Admin Dashboard
                          </button>
                      )}

                      {currentUser && TIER_CONFIG[currentUser.tier].allowBranding && (
                          <button onClick={() => { onOpenSettings(); setMenuOpen(false); }} className="w-full py-3 px-4 bg-slate-100 rounded-xl font-bold text-slate-700 flex items-center gap-3">
                              <Settings size={18} /> {t('studioSettings')}
                          </button>
                      )}

                      <button onClick={onLogout} className="w-full py-3 px-4 bg-red-50 text-red-600 rounded-xl font-bold flex items-center gap-3">
                          <LogOut size={18} /> {t('logOut')}
                      </button>
                  </>
              ) : (
                  <button onClick={onLogout} className="w-full py-3 bg-slate-100 rounded-xl font-bold text-slate-700">
                      {t('logOut')}
                  </button>
              )}
          </div>
      )}
    </nav>
  );
};