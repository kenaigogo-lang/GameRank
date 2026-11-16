import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'nes.css/css/nes.min.css';
import './index.css';
import './themes/nes.css';
import './themes/arcade.css';
import { applyTheme, loadTheme } from './theme';

// 在第一次繪製前就套上使用者上次選的主題
applyTheme(loadTheme());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);