import React from 'react';
import { X, ShieldCheck, Lock, FileText, Server, UserCheck } from 'lucide-react';
import { TranslateFn } from '../types';

interface TermsModalProps {
  onClose: () => void;
  t: TranslateFn;
}

export const TermsModal: React.FC<TermsModalProps> = ({ onClose, t }) => {
  // Helper to split list strings by newline for rendering
  const renderList = (text: string) => {
    return (
      <ul className="text-xs space-y-1.5 text-slate-600">
        {text.split('\n').map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-sm flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                <ShieldCheck size={24} />
             </div>
             <div>
                <h3 className="text-xl font-bold text-slate-900">{t('termsTitle')}</h3>
                <p className="text-xs text-slate-500 font-medium">{t('effectiveDate')}: {new Date().toLocaleDateString()}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors border border-slate-200">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 text-slate-600 space-y-8 custom-scrollbar">
            
            {/* Introduction */}
            <section>
                <h4 className="text-lg font-bold text-slate-900 mb-3 flex items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mr-3 text-slate-700 font-black text-xs">01</div>
                    {t('introTitle')}
                </h4>
                <p className="text-sm leading-relaxed mb-2 pl-11">
                    {t('introText')}
                </p>
            </section>

            {/* GDPR Section */}
            <section className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                <h4 className="text-lg font-bold text-indigo-900 mb-4 flex items-center">
                    <Server size={20} className="mr-2 text-indigo-600"/> {t('gdprTitle')}
                </h4>
                <p className="text-sm leading-relaxed mb-4 text-indigo-800">
                    {t('gdprText')}
                </p>
                
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                        <h5 className="font-bold text-indigo-900 text-xs uppercase tracking-wider mb-2">{t('dataCollectTitle')}</h5>
                        {renderList(t('dataCollectList'))}
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                        <h5 className="font-bold text-indigo-900 text-xs uppercase tracking-wider mb-2">{t('yourRightsTitle')}</h5>
                        {renderList(t('yourRightsList'))}
                    </div>
                </div>
                <p className="text-xs text-indigo-700/70 mt-4 italic">
                    {t('gdprNote')}
                </p>
            </section>

            {/* User Responsibilities */}
            <section>
                <h4 className="text-lg font-bold text-slate-900 mb-3 flex items-center">
                    <UserCheck size={20} className="mr-2 text-slate-700"/> {t('userRespTitle')}
                </h4>
                <div className="pl-8">
                    <p className="text-sm leading-relaxed mb-3">
                        {t('userRespText')}
                    </p>
                    <ul className="list-disc pl-5 text-sm space-y-1 mb-3">
                        {t('userRespList').split('\n').map((item, idx) => (
                             <li key={idx}>{item.replace(/^•\s*/, '')}</li>
                        ))}
                    </ul>
                    <p className="text-sm leading-relaxed">
                        {t('userRespFooter')}
                    </p>
                </div>
            </section>

            {/* Liability Disclaimer */}
            <section>
                <h4 className="text-lg font-bold text-slate-900 mb-3 flex items-center">
                    <Lock size={20} className="mr-2 text-amber-600"/> {t('liabilityTitle')}
                </h4>
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-900 text-sm leading-relaxed font-medium">
                    <p className="mb-3">
                        {t('liabilityText1')}
                    </p>
                    <p>
                        {t('liabilityText2')}
                    </p>
                </div>
            </section>

            {/* Contact */}
            <section>
                <h4 className="text-lg font-bold text-slate-900 mb-2">{t('contactUsTitle')}</h4>
                <p className="text-sm leading-relaxed">
                    {t('contactUsText')} <a href="mailto:admin@skytech.mk" className="text-indigo-600 font-bold hover:underline">admin@skytech.mk</a>
                </p>
            </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex flex-col sm:flex-row gap-3 justify-between items-center">
            <p className="text-xs text-slate-400">{t('agreeFooter')}</p>
            <button 
                onClick={onClose}
                className="w-full sm:w-auto px-8 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
            >
                {t('iAgree')}
            </button>
        </div>
      </div>
    </div>
  );
};