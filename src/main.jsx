import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AchievementPopup from './components/AchievementPopup.jsx';
import '@fontsource/vt323/400.css';
import '@fontsource/silkscreen/400.css';
import './styles.css';

// A mesma página serve a janela principal e o pop-up de conquistas (#popup=...).
const popup = location.hash.match(/^#popup=(.+)$/);
if (popup) document.documentElement.classList.add('popup-window');

createRoot(document.getElementById('root')).render(
  popup ? <AchievementPopup item={JSON.parse(decodeURIComponent(popup[1]))} /> : <App />
);
