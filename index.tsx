import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportWebVitals } from './utils/performance';

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN || 'https://placeholder-dsn@sentry.io/placeholder', // Replace with actual DSN
  environment: import.meta.env.PROD ? 'production' : 'development',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Production performance monitoring
window.addEventListener('load', () => {
  // Measure basic metrics
  const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  if (perfData) {
    reportWebVitals({
      name: 'TTFB',
      value: perfData.responseStart - perfData.requestStart,
      id: 'ttfb'
    });
  }
});

root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
