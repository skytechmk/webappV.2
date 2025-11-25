import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, ShieldCheck, Lock, MapPin, Loader2 } from 'lucide-react';
import { EVENT_THEMES } from '../constants';
import { api } from '../services/api';
import { TranslateFn, UserRole, User } from '../types';

interface CreateEventModalProps {
  currentUser: User;
  onClose: () => void;
  onCreate: (data: { 
      title: string, 
      date: string, 
      city: string, 
      theme: string, 
      description: string, 
      pin: string,
      adminOptions?: { expiryType: string, durationValue: number, durationUnit: string } 
  }) => void;
  t: TranslateFn;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({ currentUser, onClose, onCreate, t }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [city, setCity] = useState(''); 
  const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const [includeDate, setIncludeDate] = useState(false);
  const [theme, setTheme] = useState<string>('Birthday');
  const [description, setDescription] = useState('');
  const [pin, setPin] = useState('');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  const [adminExpirationType, setAdminExpirationType] = useState<string>('30d');
  const [adminDurationValue, setAdminDurationValue] = useState<number>(30);
  const [adminDurationUnit, setAdminDurationUnit] = useState<'seconds' | 'minutes' | 'hours' | 'days'>('minutes');
  
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions on click outside
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCitySearch = async (query: string) => {
      setCity(query);
      if (query.length < 3) {
          setCitySuggestions([]);
          setShowSuggestions(false);
          return;
      }

      setIsSearchingCity(true);
      setShowSuggestions(true);
      try {
          // Using Photon (OpenStreetMap) for free autocomplete
          const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`);
          const data = await res.json();
          setCitySuggestions(data.features || []);
      } catch (error) {
          console.error("City search failed", error);
      } finally {
          setIsSearchingCity(false);
      }
  };

  const selectCity = (feature: any) => {
      const props = feature.properties;
      // Construct a clean city name (City, Country)
      const cityName = props.city || props.name;
      const country = props.country;
      const fullName = country ? `${cityName}, ${country}` : cityName;
      
      setCity(fullName);
      setCitySuggestions([]);
      setShowSuggestions(false);
  };

  const handleGenerateDesc = async () => {
    if (!title) return;
    setIsGeneratingDesc(true);
    const dateStr = (includeDate && date) ? date : "soon";
    try {
        const desc = await api.generateEventDescription(title, dateStr, theme);
        setDescription(desc);
    } catch (error) {
        console.error("Failed to generate description", error);
        setDescription(`Join us for a amazing ${theme.toLowerCase()}!`);
    } finally {
        setIsGeneratingDesc(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
        title,
        date: includeDate ? date : '',
        city: city.trim(), 
        theme,
        description: description || `Join us for a amazing ${theme.toLowerCase()}!`,
        pin,
        adminOptions: currentUser.role === UserRole.ADMIN ? {
            expiryType: adminExpirationType,
            durationValue: adminDurationValue,
            durationUnit: adminDurationUnit
        } : undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-xl font-bold text-slate-900">{t('createEvent')}</h3>
          <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('eventTitle')}</label>
            <input 
              type="text" 
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sarah's 30th Birthday"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          {/* NEW: City Input with Autocomplete */}
          <div className="relative" ref={suggestionsRef}>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <MapPin size={16} className="text-slate-400" /> {t('locationCity')}
            </label>
            <div className="relative">
                <input 
                  type="text"
                  value={city}
                  onChange={(e) => handleCitySearch(e.target.value)}
                  placeholder="Type to search city (e.g. Skopje)..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
                  autoComplete="off"
                />
                {isSearchingCity && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 size={16} className="animate-spin text-indigo-500" />
                    </div>
                )}
            </div>
            
            {/* Suggestions Dropdown */}
            {showSuggestions && citySuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 z-20 max-h-48 overflow-y-auto custom-scrollbar">
                    {citySuggestions.map((feature: any, idx: number) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => selectCity(feature)}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0 flex flex-col"
                        >
                            <span className="font-bold text-slate-800">{feature.properties.name}</span>
                            <span className="text-xs text-slate-500">
                                {[feature.properties.state, feature.properties.country].filter(Boolean).join(', ')}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1 ml-1">{t('locationHelpText')}</p>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('eventTheme')}</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {EVENT_THEMES.map((tItem) => (
                <button
                  key={tItem.id}
                  type="button"
                  onClick={() => setTheme(tItem.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 min-h-[70px] ${
                    theme === tItem.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-2xl mb-2">{tItem.emoji}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-center leading-tight break-words px-1">{t(tItem.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {currentUser?.role === UserRole.ADMIN && (
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <label className="block text-sm font-bold text-amber-800 mb-2 flex items-center">
                      <ShieldCheck size={16} className="mr-2"/> {t('adminSettings')}
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                        {['10d', '20d', '30d', 'unlimited', 'custom'].map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setAdminExpirationType(type)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${
                                  adminExpirationType === type 
                                  ? 'bg-amber-100 border-amber-300 text-amber-900' 
                                  : 'bg-white border-amber-200 text-slate-600 hover:bg-amber-50'
                              }`}
                            >
                              {type === 'unlimited' ? t('unlimited') : type === 'custom' ? t('customDuration') : `${type.replace('d', '')} ${t('days')}`}
                            </button>
                        ))}
                  </div>
                  
                  {adminExpirationType === 'custom' && (
                      <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                            <input 
                              type="number"
                              min="1"
                              value={adminDurationValue}
                              onChange={(e) => setAdminDurationValue(parseInt(e.target.value) || 0)}
                              className="w-1/3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-200 outline-none"
                            />
                            <select 
                              value={adminDurationUnit}
                              onChange={(e) => setAdminDurationUnit(e.target.value as any)}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-200 outline-none"
                            >
                              <option value="seconds">{t('seconds')}</option>
                              <option value="minutes">{t('minutes')}</option>
                              <option value="hours">{t('hours')}</option>
                              <option value="days">{t('days')}</option>
                            </select>
                      </div>
                  )}
              </div>
          )}

          <div>
             <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Lock size={16} className="text-slate-400"/> {t('optionalPin')}
             </label>
             <input 
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t('pinDesc')}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
             />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-slate-700">{t('eventDate')}</label>
                <label className="flex items-center space-x-2 cursor-pointer">
                    <div className={`w-10 h-5 rounded-full p-1 transition-colors ${includeDate ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${includeDate ? 'translate-x-5' : ''}`} />
                    </div>
                    <input 
                      type="checkbox" 
                      checked={includeDate} 
                      onChange={(e) => setIncludeDate(e.target.checked)}
                      className="hidden"
                    />
                    <span className="text-xs font-semibold text-slate-500">{t('setDate')}</span>
                </label>
            </div>
            
            {includeDate && (
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all animate-in fade-in slide-in-from-top-1"
              />
            )}
          </div>
          
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-bold text-indigo-900 flex items-center">
                <Sparkles size={14} className="mr-1.5 text-indigo-500" /> 
                {t('aiDesc')}
              </label>
              <button 
                type="button"
                onClick={handleGenerateDesc}
                disabled={!title || isGeneratingDesc}
                className="text-xs bg-white text-indigo-600 px-3 py-1 rounded-full shadow-sm font-bold hover:shadow-md transition-all disabled:opacity-50 disabled:shadow-none"
              >
                {isGeneratingDesc ? t('generating') : t('autoGenerate')}
              </button>
            </div>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('aiPlaceholder')}
              className="w-full px-3 py-2 bg-white rounded-lg border border-indigo-200 text-sm focus:outline-none focus:border-indigo-400 h-24 resize-none text-slate-900"
            />
          </div>

          <div className="pt-2">
            <button 
              type="submit"
              className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all transform active:scale-95"
            >
              {t('createParty')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};