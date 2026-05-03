import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async'; // ✅ New
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider> {/* ✅ New Wrapper */}
      <App />
    </HelmetProvider>
  </StrictMode>,
);