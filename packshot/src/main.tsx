import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { restore, startPersistence } from './state/persist';
import './styles.css';

registerSW({ immediate: true });

restore()
  .catch((e) => console.warn('Session restore failed', e))
  .finally(() => {
    startPersistence();
    createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
  });
