import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './src/index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportWebVitals } from './utils/performance';

const sentryDsn = process.env.VITE_SENTRY_DSN;
if (sentryDsn && sentryDsn !== 'https://placeholder-dsn@sentry.io/placeholder') {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

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
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
