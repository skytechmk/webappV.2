import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Link as LinkIcon, Download, MessageCircle, Share2 } from 'lucide-react';
import { TranslateFn } from '../types';

interface ShareModalProps {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
  t: TranslateFn;
}

export const ShareModal: React.FC<ShareModalProps> = ({ eventId, eventTitle, onClose, t }) => {
  const eventUrl = `${window.location.origin}?event=${eventId}`;
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  // Native Share Handler
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SnapifY Event',
          text: `Join the party! ${eventTitle}`,
          url: eventUrl,
        });
      } catch (err) {
        // User cancelled or failed, fallback logic can go here
      }
    } else {
      // Fallback for desktop if they somehow clicked it
      handleCopy();
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById("share-qr");
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QR_${eventTitle.replace(/\s+/g, '_')}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      };
      img.src = "data:image/svg+xml;base64," + btoa(svgData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-900">Share Event</h3>
          <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-100 transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        
        <div className="p-8 flex flex-col items-center space-y-6">
          <div className="bg-white p-4 rounded-2xl shadow-lg border border-indigo-100">
            <QRCodeSVG id="share-qr" value={eventUrl} size={180} level="H" includeMargin />
          </div>
          
          <div className="w-full space-y-3">
            {/* Native Share Button (Only renders if supported) */}
            {typeof navigator !== 'undefined' && navigator.share && (
                <button 
                  onClick={handleNativeShare}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                    <Share2 size={20} /> Share via...
                </button>
            )}

            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <LinkIcon size={16} className="text-slate-400 flex-shrink-0" />
              <input 
                type="text" 
                readOnly 
                value={eventUrl} 
                className="bg-transparent text-sm text-slate-600 flex-1 outline-none truncate"
              />
              <button 
                onClick={handleCopy}
                className={`p-2 rounded-lg transition-colors ${copied ? 'bg-green-100 text-green-600' : 'hover:bg-white text-slate-500'}`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <a 
                  href={`https://wa.me/?text=${encodeURIComponent(`Join the party! ${eventTitle}: ${eventUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white rounded-xl font-bold hover:opacity-90 transition-opacity"
                >
                    <MessageCircle size={18} /> WhatsApp
                </a>
                <button 
                  onClick={handleDownloadQR}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
                >
                    <Download size={18} /> Save QR
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};