import React, { useState } from 'react';
import { User as UserIcon, LogIn, Shield } from 'lucide-react';
import { TranslateFn } from '../types';

interface GuestLoginModalProps {
  onLogin: (name: string) => void;
  onRegister: () => void; // New callback to trigger full auth flow
  onCancel: () => void;
  t: TranslateFn;
}

export const GuestLoginModal: React.FC<GuestLoginModalProps> = ({ onLogin, onRegister, onCancel, t }) => {
  const [guestName, setGuestName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (guestName.trim()) {
        onLogin(guestName);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6 relative">
        <button 
            onClick={onCancel} 
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
            ✕
        </button>
        
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserIcon size={24} />
          </div>
          <h3 className="text-xl font-bold text-slate-900">{t('joinParty')}</h3>
          <p className="text-slate-500 text-sm mt-1">Enter your name to join as a guest</p>
        </div>

        <form onSubmit={handleSubmit} className="mb-6">
          <input
            type="text"
            required
            autoFocus
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={t('yourName')}
            className="bg-slate-50 text-slate-900 w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all mb-3"
          />
          <button
            type="submit"
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
          >
            {t('continue')}
          </button>
          <p className="text-xs text-center text-slate-400 mt-2">
            * Photos uploaded as a guest will be <strong>public</strong>.
          </p>
        </form>

        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase tracking-wider">OR</span>
            <div className="flex-grow border-t border-slate-200"></div>
        </div>

        <div className="mt-4">
            <button
                onClick={onRegister}
                className="w-full py-3 rounded-xl border-2 border-indigo-100 text-indigo-700 font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
            >
                <Shield size={18} />
                Login for Privacy Control
            </button>
            <p className="text-xs text-center text-indigo-400 mt-2">
                Register to enable <strong>Private Uploads</strong> and manage your history.
            </p>
        </div>
      </div>
    </div>
  );
};