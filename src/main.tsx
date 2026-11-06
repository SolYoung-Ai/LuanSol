import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './store';
import { AuthProvider } from './cloud/auth';
import { CloudSyncProvider } from './cloud/useCloudSync';
import './styles.css';
import './v3.css';
import './v4.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppProvider>
        <CloudSyncProvider>
          <App />
        </CloudSyncProvider>
      </AppProvider>
    </AuthProvider>
  </React.StrictMode>,
);
