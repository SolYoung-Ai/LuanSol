import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './store';
import { AuthProvider } from './cloud/auth';
import { CloudSyncProvider } from './cloud/useCloudSync';
import { LangProvider } from './i18n';
import { applyTheme, readTheme } from './theme';
import './styles.css';
import './v3.css';
import './v4.css';

// 主题必须在 React 挂载之前写到 <html> 上：晚一帧就会先闪白再变深色。
applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <AuthProvider>
        <AppProvider>
          <CloudSyncProvider>
            <App />
          </CloudSyncProvider>
        </AppProvider>
      </AuthProvider>
    </LangProvider>
  </React.StrictMode>,
);
