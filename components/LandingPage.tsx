import React, { useState, useEffect, useRef } from 'react';
import { Zap, Globe, Menu, X, Mail } from 'lucide-react';
import { Language, TranslateFn, UserRole, TierLevel } from '../types';
import { HERO_IMAGES, getPricingTiers } from '../constants';
import { PricingCard } from './PricingCard';
import { TermsModal } from './TermsModal';

interface LandingPageProps {
  onGoogleLogin: () => void;
  onEmailAuth: (data: any, isSignUp: boolean) => void;
  onContactSales: (tier?: TierLevel) => void;
  isLoggingIn: boolean;
  authError: string;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  t: TranslateFn;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onGoogleLogin,
  onEmailAuth,
  onContactSales,
  isLoggingIn,
  authError,
  language,
  onChangeLanguage,
  t
}) => {
  const [currentHeroImageIndex, setCurrentHeroImageIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  
  // Form State
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPhotographer, setIsPhotographer] = useState(false);
  const [studioName, setStudioName] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroImageIndex((prevIndex) => (prevIndex + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Render Google Button with Retry Logic
  useEffect(() => {
    const renderGoogleButton = () => {
        if (window.google && googleButtonRef.current) {
            try {
                window.google.accounts.id.renderButton(
                    googleButtonRef.current,
                    { 
                        theme: "filled_black", 
                        size: "large", 
                        width: "100%", // Use string 100% for responsive
                        text: "continue_with",
                        shape: "pill",
                        logo_alignment: "left"
                    }
                );
            } catch (e) {
                console.error("GSI Render Error", e);
            }
        }
    };

    // Check if Google script is loaded and initialize
    const initGoogleButton = () => {
        if (window.google) {
            renderGoogleButton();
        } else {
            // If Google script isn't loaded after 5 seconds, show a fallback
            const timeout = setTimeout(() => {
                console.warn("Google Sign-In script failed to load");
                if (googleButtonRef.current) {
                    googleButtonRef.current.innerHTML = `
                        <button 
                            onclick="window.google && window.google.accounts.id.prompt()" 
                            class="w-full h-full bg-white text-slate-900 border-0 rounded-full font-bold px-4 py-3 flex items-center justify-center hover:bg-slate-100 transition-all shadow-lg hover:shadow-xl active:scale-95 group"
                        >
                            <svg class="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            <span class="tracking-tight">Continue with Google</span>
                        </button>
                    `;
                }
            }, 5000);
            return () => clearTimeout(timeout);
        }
    };

    // Try to initialize immediately
    initGoogleButton();

    // Also set up interval for retry
    const interval = setInterval(() => {
        if (window.google) {
            renderGoogleButton();
            clearInterval(interval);
        }
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEmailAuth({ name, email, password, isPhotographer, studioName }, isSignUp);
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
           {HERO_IMAGES.map((src, idx) => (
             <div 
                key={idx} 
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === currentHeroImageIndex ? 'opacity-40' : 'opacity-0'}`}
             >
               <img 
                  src={src} 
                  alt="Party Background" 
                  className="w-full h-full object-cover scale-105 animate-float-delayed" 
               />
             </div>
           ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
      </div>

      {/* Updated z-index from z-10 to z-20 to ensure dropdown appears over main content */}
      <nav className="relative z-20 flex items-center justify-between p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center space-x-2 font-bold text-2xl tracking-tight">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-white">{t('appName')}</span>
        </div>
        <div className="hidden md:flex items-center space-x-4">
          <div className="relative group">
              <button 
                  onClick={() => setShowLangMenu(!showLangMenu)} 
                  className="flex items-center text-sm text-slate-400 hover:text-white transition-colors px-2 py-1 rounded"
                  aria-haspopup="true"
                  aria-expanded={showLangMenu}
              >
                  <Globe size={16} className="mr-1"/>
                  {language.toUpperCase()}
              </button>
              {showLangMenu && (
                  <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowLangMenu(false)} />
                  <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden py-1 z-50 text-slate-900">
                      {(['en', 'mk', 'tr', 'sq'] as Language[]).map(lang => (
                          <button 
                              key={lang}
                              onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeLanguage(lang);
                                  setShowLangMenu(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-sm ${language === lang ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                          >
                              {lang.toUpperCase()}
                          </button>
                      ))}
                  </div>
                  </>
              )}
          </div>

          <button 
            onClick={() => {
              const el = document.getElementById('auth-card');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white text-black px-6 py-2 rounded-full font-semibold hover:bg-indigo-50 transition-all"
          >
            {t('getStarted')}
          </button>
        </div>
        <button className="md:hidden text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
           {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-20 left-0 right-0 z-50 bg-black/95 backdrop-blur-xl border-b border-white/10 p-4 md:hidden flex flex-col space-y-4 animate-in slide-in-from-top-5 shadow-2xl">
           <div className="grid grid-cols-2 gap-2">
              {(['en', 'mk', 'tr', 'sq'] as Language[]).map(lang => (
                  <button 
                      key={lang}
                      onClick={() => { onChangeLanguage(lang); setMobileMenuOpen(false); }}
                      onTouchStart={() => { onChangeLanguage(lang); setMobileMenuOpen(false); }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${language === lang ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'} active:bg-white/30`}
                  >
                      {lang.toUpperCase()}
                  </button>
              ))}
           </div>
           <div className="h-px bg-white/10" />
          <button 
            onClick={() => {
              const el = document.getElementById('auth-card');
              el?.scrollIntoView({ behavior: 'smooth' });
              setMobileMenuOpen(false);
            }}
            className="w-full bg-white text-black px-4 py-3 rounded-xl font-bold text-center hover:bg-slate-200"
          >
            {t('getStarted')}
          </button>
        </div>
      )}

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 md:py-12 flex flex-col items-center text-center flex-grow">
        <div className="animate-float">
           <span className="inline-block py-1 px-3 rounded-full bg-indigo-500/20 text-indigo-300 text-sm font-medium mb-6 border border-indigo-500/30">
             ✨ The Ultimate Event Companion
           </span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-tight">
          {t('heroTitlePrefix')} <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            {t('heroTitleSuffix')}
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
          {t('heroDesc')}
        </p>

        {/* Auth Card */}
        <div id="auth-card" className="w-full max-w-md bg-black/40 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl ring-1 ring-white/5">
           <div className="flex mb-6 bg-black/50 rounded-xl p-1 border border-white/5">
              <button
                onClick={() => { setIsSignUp(false); }}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 ${!isSignUp ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                {t('signIn')}
              </button>
              <button
                onClick={() => { setIsSignUp(true); }}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 ${isSignUp ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                {t('signUp')}
              </button>
           </div>

           <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {isSignUp && (
                <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider ml-1">{t('fullName')}</label>
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white/10 outline-none transition-all placeholder:text-slate-600"
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                        <label className="flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={isPhotographer}
                              onChange={e => setIsPhotographer(e.target.checked)}
                              className="w-5 h-5 rounded border-slate-500 text-indigo-600 focus:ring-indigo-500 bg-slate-800"
                            />
                            <span className="ml-3 text-sm font-bold text-slate-200">{t('iAmPhotographer')}</span>
                        </label>
                        {isPhotographer && (
                            <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider ml-1">{t('studioName')}</label>
                                <input
                                  type="text"
                                  value={studioName}
                                  onChange={e => setStudioName(e.target.value)}
                                  className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-amber-500/30 text-amber-200 focus:border-amber-500 outline-none transition-all placeholder:text-amber-500/30"
                                  placeholder="Luxe Studios"
                                />
                            </div>
                        )}
                    </div>
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider ml-1">{t('email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white/10 outline-none transition-all placeholder:text-slate-600"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider ml-1">{t('password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white/10 outline-none transition-all placeholder:text-slate-600"
                  placeholder="••••••••"
                />
              </div>

              {authError && (
                <div className="text-red-400 text-sm font-medium text-center bg-red-500/10 border border-red-500/20 py-2.5 rounded-xl animate-in fade-in slide-in-from-top-2">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 flex justify-center items-center group mt-2"
              >
                {isLoggingIn ? (
                   <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                   <span className="flex items-center">
                     {isSignUp ? t('createAccount') : t('signIn')}
                     <Mail className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                   </span>
                )}
              </button>
           </form>

           <div className="flex items-center gap-4 my-6">
              <div className="h-px bg-white/10 flex-1" />
              <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">OR</span>
              <div className="h-px bg-white/10 flex-1" />
           </div>

           {/* Google Button Container - rendered by GSI */}
           <div ref={googleButtonRef} className="w-full h-[44px] flex justify-center"></div>
           
          <p className="text-xs text-slate-500 mt-4">
            {t('terms')}
            <span className="mx-1">•</span>
            <button 
                type="button"
                onClick={() => setShowTerms(true)}
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
            >
                {t('termsLink')}
            </button>
          </p>
        </div>

        <div className="mt-24 w-full max-w-6xl">
          <h2 className="text-3xl font-bold mb-8 text-slate-200">{t('pricingTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {getPricingTiers(t).map(tier => (
              <PricingCard
                key={tier.id}
                tier={tier}
                t={t}
                onSelect={(id) => {
                  const el = document.getElementById('auth-card');
                  el?.scrollIntoView({ behavior: 'smooth' });
                  if (id !== TierLevel.FREE) onContactSales(id);
                }}
              />
            ))}
          </div>
        </div>
      </main>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} t={t} />}
    </div>
  );
};