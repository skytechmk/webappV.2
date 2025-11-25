
import React, { useState, useEffect } from 'react';
import { X, User as UserIcon, Mail, Phone, MessageCircle, Smartphone, CheckCircle, AlertCircle, Crown, Zap, Star } from 'lucide-react';
import { TranslateFn, TierLevel, PricingTier } from '../types';
import { isMobileDevice, isIOS, isAndroid } from '../utils/deviceDetection';
import { getPricingTiers } from '../constants';

interface ContactModalProps {
  onClose: () => void;
  t: TranslateFn;
  tier?: TierLevel;
}

export const ContactModal: React.FC<ContactModalProps> = ({ onClose, t, tier: initialTier }) => {
  const [selectedTier, setSelectedTier] = useState<TierLevel | null>(initialTier || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMobile = isMobileDevice();
  const isApple = isIOS();
  const isGoogle = isAndroid();

  const phoneNumber = '+41779586845';
  const formattedPhone = '+41 77 958 68 45';

  // Get all pricing tiers
  const pricingTiers = getPricingTiers(t);

  // Get tier name
  const getTierName = (tierLevel: TierLevel) => {
    const tier = pricingTiers.find(t => t.id === tierLevel);
    return tier?.name || '';
  };

  const submitUpgradeRequest = async () => {
    if (!selectedTier) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const contactMethod = isMobile ? 'WhatsApp/Phone' : 'Email';
      const response = await fetch('/api/upgrade-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('snapify_token') || ''}`
        },
        body: JSON.stringify({
          tier: selectedTier,
          contactMethod: contactMethod,
          message: `User requested upgrade to ${getTierName(selectedTier)} tier`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit upgrade request');
      }

      const result = await response.json();
      setIsSubmitted(true);

      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose();
      }, 3000);

    } catch (err) {
      console.error('Upgrade request failed:', err);
      setError('Failed to submit upgrade request. Please try contacting us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to render tier badge
  const renderTierBadge = (tier: PricingTier) => {
    if (tier.id === TierLevel.FREE) return null;

    let badgeColor = 'bg-indigo-100 text-indigo-700 border-indigo-200';
    let icon = null;

    if (tier.id === TierLevel.STUDIO) {
      badgeColor = 'bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 border-amber-300 shadow-sm';
      icon = <Crown size={12} className="mr-1.5 fill-amber-700" />;
    } else if (tier.id === TierLevel.PRO) {
      badgeColor = 'bg-purple-100 text-purple-700 border-purple-200';
      icon = <Zap size={12} className="mr-1.5 fill-purple-500" />;
    } else if (tier.id === TierLevel.BASIC) {
      badgeColor = 'bg-blue-100 text-blue-700 border-blue-200';
      icon = <Star size={12} className="mr-1.5 fill-blue-500" />;
    }

    return (
      <span className={`flex items-center px-2 py-1 rounded-full text-xs font-bold border ${badgeColor}`}>
        {icon}
        {tier.id === TierLevel.STUDIO ? 'PROFESSIONAL' : tier.id === TierLevel.PRO ? 'PREMIUM' : 'PLUS'}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-6 relative">
              <button 
                onClick={onClose} 
                className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
              >
                  <X size={20} className="text-slate-500" />
              </button>
              <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Crown size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Choose Your Plan</h3>
                  <p className="text-slate-500 mt-2">
                      Select the tier you'd like to upgrade to. An administrator will contact you to complete the upgrade.
                  </p>
              </div>

              {isSubmitted ? (
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Upgrade Request Submitted!</h3>
                  <p className="text-slate-500 mt-2">
                      Your request for the {selectedTier && getTierName(selectedTier)} tier has been sent successfully. An administrator will contact you soon to complete the upgrade.
                  </p>
                </div>
              ) : error ? (
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertCircle size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Request Failed</h3>
                  <p className="text-slate-500 mt-2">{error}</p>
                  <div className="mt-6 space-y-4">
                    <p className="text-sm text-slate-600">Please contact us directly:</p>
                    <div className="space-y-3">
                      <a
                        href="https://wa.me/41779586845"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center p-3 bg-green-50 rounded-xl border border-green-100 hover:border-green-300 hover:bg-green-100 transition-colors group"
                      >
                          <MessageCircle size={20} className="mr-2 text-green-600" />
                          <span className="font-medium text-green-900">WhatsApp: {formattedPhone}</span>
                      </a>
                      <a
                        href="mailto:admin@skytech.mk"
                        className="flex items-center justify-center p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                      >
                          <Mail size={20} className="mr-2 group-hover:text-indigo-600" />
                          <span className="font-medium text-slate-900">admin@skytech.mk</span>
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  {pricingTiers.filter(tier => tier.id !== TierLevel.FREE).map(tier => (
                    <div
                      key={tier.id}
                      onClick={() => setSelectedTier(tier.id)}
                      className={`relative p-4 border rounded-xl cursor-pointer transition-all ${
                        selectedTier === tier.id
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {renderTierBadge(tier)}
                          <h4 className="font-bold text-slate-900">{tier.name}</h4>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black text-slate-900">{tier.price}</span>
                          {tier.id !== TierLevel.STUDIO && <span className="text-slate-500">/{t('event')}</span>}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{tier.limit}</p>
                      <ul className="space-y-1">
                        {tier.features.slice(0, 2).map((feature, idx) => (
                          <li key={idx} className="text-xs text-slate-600 flex items-center">
                            <div className="w-1 h-1 bg-slate-400 rounded-full mr-2"></div>
                            {feature}
                          </li>
                        ))}
                      </ul>
                      {selectedTier === tier.id && (
                        <div className="absolute top-2 right-2 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!isSubmitted && !error && (
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitUpgradeRequest}
                    disabled={!selectedTier || isSubmitting}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Crown size={16} />
                        Request Upgrade
                      </>
                    )}
                  </button>
                </div>
              )}
        </div>
    </div>
  );
};
