import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { loadScaleTheme, saveScaleTheme } from './theme-client.mjs';

createRoot(document.getElementById('root')).render(<React.StrictMode><App loadTheme={loadScaleTheme} saveTheme={saveScaleTheme} /></React.StrictMode>);
