import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './store';
import './styles.css';
import './v3.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AppProvider><App /></AppProvider></React.StrictMode>,
);
