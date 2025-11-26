import React, { useState, useEffect, useRef } from 'react';
import {
  Zap, Globe, Menu, X, Mail, QrCode, Smartphone,
  Cast, Shield, Aperture, ArrowRight, Play, CheckCircle2
} from 'lucide-react';
import { Language, TranslateFn, TierLevel } from '../types';
import { HERO_IMAGES } from '../constants';
import { TermsModal } from './TermsModal';
import { api } from '../services/api';

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
    // Hero Rotator
    const interval = setInterval(() => {
      setCurrentHeroImageIndex((prevIndex) => (prevIndex + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Google Button Logic - Wait for proper initialization
  useEffect(() => {
    const renderGoogleButton = () => {
        if (window.google && window.google.accounts && window.google.accounts.id && window.googleSignInInitialized && googleButtonRef.current) {
            try {
                // Clear any existing content first
                googleButtonRef.current.innerHTML = '';
                window.google.accounts.id.renderButton(
                    googleButtonRef.current,
                    {
                        theme: "filled_black",
                        size: "large",
                        width: "100%",
                        text: "continue_with",
                        shape: "pill",
                    }
                );
            } catch (e) {
                console.error("GSI Render Error", e);
                // Fallback button on error
                if (googleButtonRef.current) {
                    googleButtonRef.current.innerHTML = `<button class="w-full bg-white text-black font-bold py-3 rounded-full flex items-center justify-center gap-2"><span>Continue with Google</span></button>`;
                }
            }
        }
    };

    // Check immediately if everything is ready
    if (window.google && window.google.accounts && window.google.accounts.id && window.googleSignInInitialized) {
        renderGoogleButton();
    } else {
        // Poll for Google Sign-In readiness
        const checkGoogleReady = () => {
            if (window.google && window.google.accounts && window.google.accounts.id && window.googleSignInInitialized) {
                renderGoogleButton();
            } else {
                // Continue polling
                setTimeout(checkGoogleReady, 100);
            }
        };

        // Start polling after a brief delay
        const timeoutId = setTimeout(checkGoogleReady, 100);

        // Fallback after 5 seconds
        const fallbackTimeout = setTimeout(() => {
            if (googleButtonRef.current && !googleButtonRef.current.innerHTML.includes('Google')) {
                googleButtonRef.current.innerHTML = `<button class="w-full bg-white text-black font-bold py-3 rounded-full flex items-center justify-center gap-2"><span>Continue with Google</span></button>`;
            }
        }, 5000);

        return () => {
            clearTimeout(timeoutId);
            clearTimeout(fallbackTimeout);
        };
    }
  }, []);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEmailAuth({ name, email, password, isPhotographer, studioName }, isSignUp);
  };

  const scrollToAuth = () => {
      document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-x-hidden font-sans selection:bg-indigo-500/30" role="main">
      
      {/* --- BACKGROUND LAYERS --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
           {HERO_IMAGES.map((src, idx) => (
             <div 
                key={idx} 
                className={`absolute inset-0 transition-opacity duration-[2000ms] ease-in-out ${idx === currentHeroImageIndex ? 'opacity-30' : 'opacity-0'}`}
             >
               <img src={src} alt="Background" className="w-full h-full object-cover scale-105" />
               <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-[#050505]" />
             </div>
           ))}
           {/* Noise texture overlay for premium feel */}
           <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
      </div>

      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b border-white/5 bg-black/50 supports-[backdrop-filter]:bg-black/20">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo(0,0)}>
            <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
              <Zap size={20} className="text-white fill-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">{t('appName')}</span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'})} className="text-sm font-medium text-slate-300 hover:text-white transition-colors">How it Works</button>
            <button onClick={() => document.getElementById('features')?.scrollIntoView({behavior:'smooth'})} className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Features</button>
            <button onClick={() => document.getElementById('pricing')?.scrollIntoView({behavior:'smooth'})} className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Pricing</button>
            
            <div className="h-4 w-px bg-white/10" />

            <div className="relative group">
                <button onClick={() => setShowLangMenu(!showLangMenu)} className="flex items-center text-sm text-slate-300 hover:text-white gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
                    <Globe size={14} className="text-slate-400"/> 
                    <span className="font-semibold">{language.toUpperCase()}</span>
                </button>
                {showLangMenu && (
                    <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
                    <div className="absolute top-full right-0 mt-4 w-32 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-50">
                        {(['en', 'mk', 'tr', 'sq'] as Language[]).map(lang => (
                            <button key={lang} onClick={() => { onChangeLanguage(lang); setShowLangMenu(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 ${language === lang ? 'text-indigo-400 font-bold' : 'text-slate-300'}`}>
                                {lang.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    </>
                )}
            </div>

            <button onClick={scrollToAuth} className="bg-white text-black px-5 py-2.5 rounded-full text-sm font-bold hover:bg-indigo-50 hover:scale-105 transition-all shadow-lg shadow-white/10" aria-label="Sign in to your account">
               {t('signIn')}
            </button>
          </div>

          <button className="md:hidden text-white p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
             {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black pt-24 px-6 md:hidden animate-in slide-in-from-top-10">
            <div className="flex flex-col gap-6 text-xl font-bold">
                <button onClick={() => {setMobileMenuOpen(false); scrollToAuth();}} className="text-left text-slate-300 hover:text-white transition-colors py-2 touch-manipulation min-h-[48px]">{t('signIn')}</button>
                <button onClick={() => {setMobileMenuOpen(false); document.getElementById('how-it-works')?.scrollIntoView();}} className="text-left text-slate-300 hover:text-white transition-colors py-2 touch-manipulation min-h-[48px]">How It Works</button>
                <button onClick={() => {setMobileMenuOpen(false); document.getElementById('features')?.scrollIntoView();}} className="text-left text-slate-300 hover:text-white transition-colors py-2 touch-manipulation min-h-[48px]">Features</button>
                <button onClick={() => {setMobileMenuOpen(false); document.getElementById('pricing')?.scrollIntoView();}} className="text-left text-slate-300 hover:text-white transition-colors py-2 touch-manipulation min-h-[48px]">Pricing</button>
                <div className="h-px bg-white/10" />
                <div className="grid grid-cols-4 gap-2">
                    {(['en', 'mk', 'tr', 'sq'] as Language[]).map(lang => (
                        <button key={lang} onClick={() => {onChangeLanguage(lang); setMobileMenuOpen(false);}} className={`p-3 rounded-lg text-sm text-center border touch-manipulation min-h-[48px] transition-all ${language === lang ? 'bg-indigo-600 border-indigo-500' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                            {lang.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* --- HERO SECTION --- */}
      <main className="relative z-10 pt-32 pb-20 px-6 max-w-7xl mx-auto min-h-screen flex flex-col justify-center">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            
            {/* Left Content */}
            <div className="flex-1 text-center lg:text-left space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2 animate-pulse">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    The #1 Event Sharing Platform
                </div>

                <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1]">
                    {t('heroTitlePrefix')} <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                        {t('heroTitleSuffix')}
                    </span>
                </h1>

                <p className="text-lg text-slate-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
                    {t('heroDesc')}
                </p>

                {/* Key Benefits */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto lg:mx-0 mt-8 mb-8">
                    {[
                        { icon: '⚡', text: 'Setup in 30 seconds' },
                        { icon: '📱', text: 'Works on any device' },
                        { icon: '🔒', text: 'Private & secure' }
                    ].map((benefit, i) => (
                        <div key={i} className="flex items-center gap-3 text-slate-300">
                            <span className="text-2xl">{benefit.icon}</span>
                            <span className="text-sm font-medium">{benefit.text}</span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                    <button onClick={scrollToAuth} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-8 py-4 rounded-full font-bold transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 group touch-manipulation min-h-[48px]">
                        {t('getStarted')} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>
                    </button>
                    <button className="w-full sm:w-auto px-8 py-4 rounded-full border border-white/10 hover:bg-white/5 active:bg-white/10 font-semibold transition-all flex items-center justify-center gap-2 backdrop-blur-sm touch-manipulation min-h-[48px]">
                        <Play size={18} className="fill-white" /> Watch Demo
                    </button>
                </div>

                <div className="pt-8 flex items-center justify-center lg:justify-start gap-12 opacity-80">
                     <div className="flex flex-col">
                        <span className="text-3xl font-bold text-white tracking-tighter">1M+</span>
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{t('statPhotos') || "Photos Shared"}</span>
                     </div>
                     <div className="w-px h-10 bg-white/10" />
                     <div className="flex flex-col">
                        <span className="text-3xl font-bold text-white tracking-tighter">50k+</span>
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{t('statEvents') || "Events Hosted"}</span>
                     </div>
                </div>
            </div>

            {/* Right Content - Auth Card */}
            <div className="flex-1 w-full max-w-md relative group perspective-1000">
                {/* Glow Effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[2rem] blur opacity-30 group-hover:opacity-50 transition duration-1000" />
                
                <div id="auth-card" className="relative bg-[#0A0A0A]/90 backdrop-blur-xl border border-white/10 p-8 rounded-[1.8rem] shadow-2xl">
                    <div className="flex mb-8 bg-black/40 p-1.5 rounded-xl border border-white/5">
                        <button onClick={() => setIsSignUp(false)} className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-300 touch-manipulation min-h-[48px] ${!isSignUp ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white active:bg-white/10'}`}>
                            {t('signIn')}
                        </button>
                        <button onClick={() => setIsSignUp(true)} className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all duration-300 touch-manipulation min-h-[48px] ${isSignUp ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white active:bg-white/10'}`}>
                            {t('signUp')}
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isSignUp && (
                            <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">{t('fullName')}</label>
                                    <input 
                                        type="text" value={name} onChange={e => setName(e.target.value)}
                                        className="w-full mt-1.5 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                        placeholder="Jane Doe"
                                    />
                                </div>
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-500/30 transition-colors cursor-pointer" onClick={() => setIsPhotographer(!isPhotographer)}>
                                    <input type="checkbox" checked={isPhotographer} onChange={e => setIsPhotographer(e.target.checked)} className="w-5 h-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-600 bg-transparent"/>
                                    <span className="text-sm font-medium text-slate-300">{t('iAmPhotographer')}</span>
                                </div>
                                {isPhotographer && (
                                    <div className="animate-in fade-in">
                                        <input 
                                            type="text" value={studioName} onChange={e => setStudioName(e.target.value)}
                                            className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-200 placeholder-amber-500/50 focus:border-amber-500 outline-none transition-all"
                                            placeholder={t('studioName')}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                        <div>
                            <label htmlFor="email" className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">{t('email')}</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full mt-1.5 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                placeholder="name@example.com"
                                aria-describedby="email-error"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">{t('password')}</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full mt-1.5 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                placeholder="••••••••"
                                aria-describedby="password-error"
                                required
                            />
                        </div>

                        {authError && <div id="auth-error" className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center animate-in fade-in" role="alert" aria-live="polite">{authError}</div>}

                        <button disabled={isLoggingIn} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:from-indigo-700 active:to-purple-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex justify-center items-center touch-manipulation min-h-[48px]">
                            {isLoggingIn ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : (isSignUp ? t('createAccount') : t('signIn'))}
                        </button>
                    </form>

                    <div className="flex items-center gap-4 my-6 opacity-50">
                        <div className="h-px bg-white flex-1" />
                        <span className="text-xs font-bold tracking-widest">OR</span>
                        <div className="h-px bg-white flex-1" />
                    </div>

                    <div ref={googleButtonRef} className="h-[44px] w-full flex justify-center" />
                    
                    <p className="text-center text-xs text-slate-500 mt-6">
                        {t('terms')} <button onClick={() => setShowTerms(true)} className="text-indigo-400 hover:underline underline-offset-2">{t('termsLink')}</button>
                    </p>
                </div>
            </div>
        </div>
      </main>

      {/* --- HOW IT WORKS (The Hook) --- */}
      <section id="how-it-works" className="py-24 bg-[#0A0A0A] relative border-y border-white/5 scroll-mt-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
         <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-black mb-4">Three Steps to <span className="text-indigo-400">Magic</span></h2>
                <p className="text-slate-400 max-w-2xl mx-auto text-lg">Forget complex apps and signup forms for guests. We made it frictionless.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 relative">
                <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-indigo-500/0 via-indigo-500/20 to-indigo-500/0 border-t border-dashed border-white/10" />
                
                {[
                    { icon: QrCode, title: t('step1Title') || "1. Create", desc: t('step1Desc') || "Setup event in 30s" },
                    { icon: Smartphone, title: t('step2Title') || "2. Scan", desc: t('step2Desc') || "Guests scan QR to join" },
                    { icon: Cast, title: t('step3Title') || "3. Show", desc: t('step3Desc') || "Watch live on the big screen" },
                ].map((step, i) => (
                    <div key={i} className="relative z-10 bg-[#050505] border border-white/10 p-8 rounded-3xl text-center hover:border-indigo-500/30 transition-all group hover:-translate-y-2 duration-300 shadow-2xl shadow-black">
                        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-white/5">
                            <step.icon className="text-indigo-400" size={32} />
                        </div>
                        <h3 className="text-xl font-bold mb-3 text-white">{step.title}</h3>
                        <p className="text-slate-400 leading-relaxed">{step.desc}</p>
                    </div>
                ))}
            </div>
         </div>
      </section>

      {/* --- FEATURES GRID (Bento Box) --- */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto scroll-mt-20 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
         <h2 className="text-3xl md:text-5xl font-black mb-16 text-center">Everything you need to <br/>capture the <span className="text-purple-400">Chaos & Joy</span></h2>
         
         <div className="grid grid-cols-1 md:grid-cols-6 md:grid-rows-2 gap-6 h-auto md:h-[600px]">
             {/* Large Left Card - Live Wall */}
             <div className="md:col-span-4 md:row-span-2 bg-[#111] border border-white/10 rounded-[2rem] overflow-hidden relative group">
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
                <img src="https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-60 grayscale group-hover:grayscale-0" alt="Live Wall" />
                <div className="absolute bottom-0 left-0 p-8 md:p-12 z-20">
                    <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 border border-white/10">
                        <Cast className="text-white" size={28} />
                    </div>
                    <h3 className="text-3xl font-bold mb-3">{t('featLiveWall') || "Live Slideshow"}</h3>
                    <p className="text-slate-300 max-w-md text-lg leading-relaxed">{t('featLiveWallDesc') || "Turn any TV or projector into a live social feed. Photos pop up seconds after they're snapped."}</p>
                </div>
             </div>

             {/* Top Right - AI */}
             <div className="md:col-span-2 bg-[#111] border border-white/10 rounded-[2rem] p-8 hover:bg-[#161616] transition-colors relative overflow-hidden group">
                 <div className="absolute top-[-20px] right-[-20px] p-0 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
                     <Aperture size={180} />
                 </div>
                 <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                     <span className="text-pink-500">✨</span> {t('featAI') || "AI Find Me"}
                 </h3>
                 <p className="text-slate-400 text-sm leading-relaxed mb-6">{t('featAIDesc') || "Guests take a selfie and our AI instantly filters the gallery to show only their photos."}</p>
                 <div className="w-full h-24 bg-gradient-to-r from-pink-500/20 to-purple-600/20 rounded-xl border border-pink-500/20 flex items-center justify-center">
                    <span className="text-pink-300 text-xs font-mono">Face Detection Active</span>
                 </div>
             </div>

             {/* Bottom Right - Privacy */}
             <div className="md:col-span-2 bg-[#111] border border-white/10 rounded-[2rem] p-8 hover:bg-[#161616] transition-colors relative">
                 <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                     <Shield className="text-emerald-400" size={24} /> {t('featPrivacy') || "Private & Secure"}
                 </h3>
                 <p className="text-slate-400 text-sm mb-6 leading-relaxed">{t('featPrivacyDesc') || "Optional PIN codes, admin moderation, and private uploads."}</p>
                 <div className="flex gap-2">
                     <div className="h-3 flex-1 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
                     <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                 </div>
             </div>
         </div>
      </section>

      {/* --- STUDIO / PRO SECTION --- */}
      <section className="py-24 bg-gradient-to-b from-[#0A0A0A] to-black border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
            <div className="bg-gradient-to-br from-amber-500/5 to-orange-600/5 border border-amber-500/20 rounded-[2.5rem] p-8 md:p-16 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />
                
                <div className="flex flex-col md:flex-row items-center gap-12 relative z-10">
                    <div className="flex-1 space-y-8 text-center md:text-left">
                        <div className="inline-block px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold text-xs uppercase tracking-wider">
                            {t('studioDashboard') || "SnapifY for Professionals"}
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-amber-50">{t('proTitle')}</h2>
                        <p className="text-amber-100/70 text-lg max-w-lg leading-relaxed mx-auto md:mx-0">
                            {t('proDesc')} Instant delivery, automated watermarking, and lead generation. Stop chasing clients for emails.
                        </p>
                        <ul className="space-y-4 inline-block text-left">
                            {['Automated Watermarking', 'Instant ZIP Delivery', 'Client Data Capture', 'White-label Galleries'].map((item, i) => (
                                <li key={i} className="flex items-center gap-3 text-amber-100/80">
                                    <CheckCircle2 size={20} className="text-amber-400 shrink-0" /> {item}
                                </li>
                            ))}
                        </ul>
                        <div className="pt-4">
                            <button onClick={() => {
                                setIsPhotographer(true);
                                setIsSignUp(true);
                                scrollToAuth();
                            }} className="bg-amber-500 hover:bg-amber-400 text-black px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20">
                                Apply for Studio Account
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 w-full relative perspective-1000">
                        {/* Mock UI for Studio */}
                        <div className="bg-[#0f0f0f] border border-amber-500/20 rounded-2xl p-6 shadow-2xl rotate-y-12 md:rotate-6 hover:rotate-0 transition-transform duration-700 max-w-sm mx-auto">
                             <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                                 <div className="flex items-center gap-3">
                                     <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold border border-amber-500/30">LS</div>
                                     <div>
                                         <div className="font-bold text-white">Luxe Studios</div>
                                         <div className="text-xs text-slate-400">Pro Dashboard</div>
                                     </div>
                                 </div>
                                 <div className="text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">+24 Leads</div>
                             </div>
                             <div className="space-y-4">
                                 <div className="bg-white/5 rounded-lg border border-white/5 p-4">
                                     <div className="flex justify-between text-xs text-slate-400 mb-2">
                                         <span>Storage Used</span>
                                         <span>75GB / 100GB</span>
                                     </div>
                                     <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                         <div className="h-full w-3/4 bg-amber-500 rounded-full" />
                                     </div>
                                 </div>
                                 <div className="h-32 bg-[url('https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80')] bg-cover rounded-lg opacity-50 flex items-end p-2 relative">
                                     <div className="absolute bottom-2 right-2 text-[10px] text-white/50 font-bold">Luxe Studios ©</div>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </section>


      {/* --- CONTACT SALES --- */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto scroll-mt-20">
        <h2 className="text-3xl md:text-5xl font-black mb-6 text-center">Contact Sales</h2>
        <p className="text-slate-400 text-center max-w-2xl mx-auto mb-16 text-lg">Get in touch with our team to discuss your event needs.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
                {
                    icon: '💬',
                    method: 'WhatsApp',
                    contact: '+41 77 958 68 45',
                    link: 'https://wa.me/41779586845'
                },
                {
                    icon: '📱',
                    method: 'Viber',
                    contact: '+41 77 958 68 45',
                    link: 'viber://chat?number=%2B41779586845'
                },
                {
                    icon: '✉️',
                    method: 'Email',
                    contact: 'admin@skytech.mk',
                    link: 'mailto:admin@skytech.mk'
                }
            ].map((contact, i) => (
                <a
                    key={i}
                    href={contact.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#111] border border-white/10 p-8 rounded-3xl text-center hover:border-indigo-500/30 transition-all group hover:-translate-y-1 duration-300 shadow-2xl shadow-black"
                >
                    <div className="text-4xl mb-4">{contact.icon}</div>
                    <h3 className="text-xl font-bold mb-2 text-white">{contact.method}</h3>
                    <p className="text-slate-400">{contact.contact}</p>
                </a>
            ))}
        </div>
      </section>

      {/* --- FAQ SECTION --- */}
      <section className="py-24 bg-[#0A0A0A] border-y border-white/5">
        <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-black mb-4">Frequently Asked <span className="text-blue-400">Questions</span></h2>
                <p className="text-slate-400 text-lg">Everything you need to know about SnapifY</p>
            </div>

            <div className="space-y-6">
                {[
                    {
                        question: "How does the live slideshow work?",
                        answer: "Photos appear on the big screen within seconds of being taken. Our real-time system ensures instant sharing without any lag or delays."
                    },
                    {
                        question: "Is my event data secure?",
                        answer: "Absolutely. All photos are encrypted, and you control privacy settings. Optional PIN codes and admin moderation keep everything secure."
                    },
                    {
                        question: "Do guests need to download an app?",
                        answer: "No apps required! Guests simply scan a QR code with their phone's camera and can start sharing photos immediately."
                    },
                    {
                        question: "What happens to photos after the event?",
                        answer: "You get a complete gallery with all photos organized by AI. Professional accounts include automated watermarking and instant ZIP delivery."
                    },
                    {
                        question: "Can I use this for corporate events?",
                        answer: "Definitely! SnapifY works perfectly for conferences, team building, product launches, and any event where engagement matters."
                    },
                    {
                        question: "What's the difference between free and paid plans?",
                        answer: "Free plan includes basic event creation and sharing. Paid plans add unlimited events, advanced moderation, custom branding, and priority support."
                    }
                ].map((faq, i) => (
                    <details key={i} className="group bg-[#111] border border-white/10 rounded-2xl p-6 hover:border-blue-500/30 transition-all">
                        <summary className="cursor-pointer text-lg font-bold text-white flex items-center justify-between group-open:text-blue-400">
                            {faq.question}
                            <span className="text-slate-400 group-open:rotate-45 transition-transform">＋</span>
                        </summary>
                        <p className="text-slate-400 mt-4 leading-relaxed">{faq.answer}</p>
                    </details>
                ))}
            </div>

            <div className="text-center mt-12">
                <p className="text-slate-400 mb-4">Still have questions?</p>
                <button onClick={() => setShowTerms(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-bold transition-all">
                    Contact Support
                </button>
            </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-black border-t border-white/10 py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                  <div className="bg-white/10 p-2 rounded-lg"><Zap size={16} /></div>
                  <span className="font-bold tracking-tight">{t('appName')}</span>
              </div>
              <div className="text-sm text-slate-500">
                  © {new Date().getFullYear()} {t('appName')}. All rights reserved.
              </div>
              <button onClick={() => setShowTerms(true)} className="text-sm text-slate-400 hover:text-white transition-colors underline decoration-slate-600 underline-offset-4">
                  {t('termsLink')}
              </button>
          </div>
      </footer>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} t={t} />}
    </div>
  );
};