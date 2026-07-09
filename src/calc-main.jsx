import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.css';
import { initPostHog } from '@/lib/posthog';
import CalcApp from '@/calc/CalcApp';

// Standalone /calc entry: no AuthProvider / WeddingProvider / QueryClientProvider / ThemeProvider.
// Light theme only. The calculator computes client-side; lead capture is a plain fetch.
initPostHog();

ReactDOM.createRoot(document.getElementById('calc-root')).render(<CalcApp />);
