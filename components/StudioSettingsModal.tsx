

import React, { useState, useRef } from 'react';
import { X, Upload, Briefcase, Image as ImageIcon, Trash2, Save, Eye, LayoutGrid } from 'lucide-react';
import { User, TranslateFn, WatermarkPosition, TIER_CONFIG } from '../types';

interface StudioSettingsModalProps {
  currentUser: User;
  onClose: () => void;
  onSave: (updates: Partial<User>) => void;
  t: TranslateFn;
}

export const StudioSettingsModal: React.FC<StudioSettingsModalProps> = ({ currentUser, onClose, onSave, t }) => {
  // Check if user has branding permission
  if (!TIER_CONFIG[currentUser.tier].allowBranding) {
    onClose();
    return null;
  }
  const [studioName, setStudioName] = useState(currentUser.studioName || '');
  const [logoUrl, setLogoUrl] = useState(currentUser.logoUrl || '');
  const [opacity, setOpacity] = useState(currentUser.watermarkOpacity || 0.85);
  const [size, setSize] = useState(currentUser.watermarkSize || 20);
  
  // Positioning State
  const [position, setPosition] = useState<WatermarkPosition>(currentUser.watermarkPosition || 'bottom-right');
  const [offsetX, setOffsetX] = useState(currentUser.watermarkOffsetX || 2); // Default 2%
  const [offsetY, setOffsetY] = useState(currentUser.watermarkOffsetY || 2); // Default 2%

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize to reasonable dimensions to prevent LocalStorage overflow
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setLogoUrl(canvas.toDataURL('image/png'));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({
      studioName,
      logoUrl,
      watermarkOpacity: opacity,
      watermarkSize: size,
      watermarkPosition: position,
      watermarkOffsetX: offsetX,
      watermarkOffsetY: offsetY
    });
    onClose();
  };

  // Helper for preview positioning
  const getPreviewStyle = () => {
    const style: React.CSSProperties = {
      position: 'absolute',
      width: `${size}%`,
      opacity: opacity,
      height: 'auto'
    };

    switch (position) {
      case 'top-left':
        style.top = `${offsetY}%`;
        style.left = `${offsetX}%`;
        break;
      case 'top-right':
        style.top = `${offsetY}%`;
        style.right = `${offsetX}%`;
        break;
      case 'bottom-left':
        style.bottom = `${offsetY}%`;
        style.left = `${offsetX}%`;
        break;
      case 'bottom-right':
        style.bottom = `${offsetY}%`;
        style.right = `${offsetX}%`;
        break;
      case 'center':
        style.top = `50%`;
        style.left = `50%`;
        style.transform = `translate(-50%, -50%) translate(${offsetX}%, ${offsetY}%)`;
        break;
    }
    return style;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <Briefcase className="text-indigo-600" size={24} />
            <h3 className="text-xl font-bold text-slate-900">{t('studioSettings')}</h3>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('studioName')}</label>
            <input 
              type="text" 
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
               <span>{t('uploadLogo')}</span>
               <span className="text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">PNG / Transparent</span>
            </label>
            <p className="text-xs text-slate-500 mb-4">{t('logoDesc')}</p>
            
            {logoUrl ? (
              <div className="space-y-6">
                  {/* Live Preview */}
                  <div className="relative w-full aspect-video bg-slate-200 rounded-lg overflow-hidden border border-slate-300 shadow-inner">
                      <img 
                         src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=60&w=600" 
                         className="w-full h-full object-cover opacity-75 grayscale-[0.2]"
                         alt="Preview Background"
                      />
                      <img 
                          src={logoUrl} 
                          alt="Watermark Preview"
                          style={getPreviewStyle()}
                      />
                      <div className="absolute top-2 right-2">
                        <button 
                          onClick={() => setLogoUrl('')}
                          className="bg-white/80 text-red-600 p-1.5 rounded-full hover:bg-white transition-colors shadow-sm"
                          title={t('removeLogo')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                  </div>

                  {/* Position Controls */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-2">
                      <LayoutGrid size={14} /> {t('position')}
                    </label>
                    <div className="grid grid-cols-3 gap-2 w-32 mb-4 mx-auto md:mx-0">
                        {/* Top Left */}
                        <button 
                          onClick={() => setPosition('top-left')}
                          className={`aspect-square border rounded flex items-start justify-start p-1 hover:bg-indigo-50 ${position === 'top-left' ? 'border-indigo-600 bg-indigo-100' : 'border-slate-300'}`}
                        >
                           <div className={`w-2 h-2 rounded-sm ${position === 'top-left' ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                        </button>
                        {/* Top Center - disabled/placeholder */}
                        <div className="aspect-square" />
                        {/* Top Right */}
                        <button 
                          onClick={() => setPosition('top-right')}
                          className={`aspect-square border rounded flex items-start justify-end p-1 hover:bg-indigo-50 ${position === 'top-right' ? 'border-indigo-600 bg-indigo-100' : 'border-slate-300'}`}
                        >
                           <div className={`w-2 h-2 rounded-sm ${position === 'top-right' ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                        </button>

                         {/* Center Left - disabled */}
                         <div className="aspect-square" />
                         {/* Center */}
                         <button 
                          onClick={() => setPosition('center')}
                          className={`aspect-square border rounded flex items-center justify-center p-1 hover:bg-indigo-50 ${position === 'center' ? 'border-indigo-600 bg-indigo-100' : 'border-slate-300'}`}
                        >
                           <div className={`w-2 h-2 rounded-sm ${position === 'center' ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                        </button>
                        {/* Center Right - disabled */}
                        <div className="aspect-square" />

                        {/* Bottom Left */}
                        <button 
                          onClick={() => setPosition('bottom-left')}
                          className={`aspect-square border rounded flex items-end justify-start p-1 hover:bg-indigo-50 ${position === 'bottom-left' ? 'border-indigo-600 bg-indigo-100' : 'border-slate-300'}`}
                        >
                           <div className={`w-2 h-2 rounded-sm ${position === 'bottom-left' ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                        </button>
                        {/* Bottom Center - disabled */}
                        <div className="aspect-square" />
                        {/* Bottom Right */}
                        <button 
                          onClick={() => setPosition('bottom-right')}
                          className={`aspect-square border rounded flex items-end justify-end p-1 hover:bg-indigo-50 ${position === 'bottom-right' ? 'border-indigo-600 bg-indigo-100' : 'border-slate-300'}`}
                        >
                           <div className={`w-2 h-2 rounded-sm ${position === 'bottom-right' ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                        </button>
                    </div>
                  </div>

                  {/* Appearance Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">{t('opacity')}: {Math.round(opacity * 100)}%</label>
                          <input 
                            type="range" 
                            min="0.1" 
                            max="1" 
                            step="0.05" 
                            value={opacity}
                            onChange={(e) => setOpacity(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">{t('size')}: {size}%</label>
                          <input 
                            type="range" 
                            min="5" 
                            max="50" 
                            step="1" 
                            value={size}
                            onChange={(e) => setSize(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                      </div>
                  </div>

                  {/* Offset Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-100 p-3 rounded-lg">
                      <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">{t('offsetX')}: {offsetX}%</label>
                          <input 
                            type="range" 
                            min="0" 
                            max="30" 
                            step="1" 
                            value={offsetX}
                            onChange={(e) => setOffsetX(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-slate-600"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">{t('offsetY')}: {offsetY}%</label>
                          <input 
                            type="range" 
                            min="0" 
                            max="30" 
                            step="1" 
                            value={offsetY}
                            onChange={(e) => setOffsetY(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-slate-600"
                          />
                      </div>
                  </div>
              </div>
            ) : (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer"
              >
                <ImageIcon size={32} className="mb-2" />
                <span className="text-sm font-bold">{t('upload')}</span>
              </button>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
            />
          </div>

          <button 
            onClick={handleSave}
            className="w-full bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg transition-all"
          >
            <Save size={18} />
            {t('saveSettings')}
          </button>
        </div>
      </div>
    </div>
  );
};