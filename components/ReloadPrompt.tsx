import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RotateCcw, X, RefreshCw } from 'lucide-react';

export const ReloadPrompt: React.FC = () => {
  const [isDev] = useState(() => import.meta.env.DEV);
  const [manualChecking, setManualChecking] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: any) {
      // Check for updates frequently in both dev and prod
      if (r) {
        const interval = 5 * 1000; // 5 seconds in both dev and prod
        setInterval(() => {
          r.update();
        }, interval);
      }
    },
    onRegisterError(error: any) {
      // SW registration error logged for debugging
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const checkForUpdates = async () => {
    setManualChecking(true);
    try {
      // Force check for updates
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
      }
      // Small delay to show loading state
      setTimeout(() => setManualChecking(false), 1000);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setManualChecking(false);
    }
  };

  // Keyboard shortcut for force refresh in development
  useEffect(() => {
    if (!isDev) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + R for force refresh
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        checkForUpdates();
      }
    };

    // Add global function for console access
    (window as any).forceAppUpdate = checkForUpdates;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDev]);

  // Show component in dev mode or when there are updates/offline ready
  if (!isDev && !offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 flex flex-col gap-3 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-sm">
            {offlineReady ? 'App ready to work offline' : needRefresh ? 'New content available, click on reload button to update.' : 'Development Mode'}
          </h3>
          {!needRefresh && !offlineReady && (
            <p className="text-xs text-slate-400 mt-1">Auto-checks for updates every 5 seconds{isDev ? ' • Ctrl+Shift+R or use forceAppUpdate() in console' : ''}</p>
          )}
        </div>
        {!isDev && (
          <button onClick={close} className="text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors flex-1"
          >
             <RotateCcw size={16} /> Reload & Update
          </button>
        )}

        {isDev && (
          <button
            onClick={checkForUpdates}
            disabled={manualChecking}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors flex-1"
          >
            <RefreshCw size={16} className={manualChecking ? 'animate-spin' : ''} />
            {manualChecking ? 'Checking...' : 'Check Updates'}
          </button>
        )}
      </div>
    </div>
  );
};