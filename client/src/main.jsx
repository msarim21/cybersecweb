import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './index.css';

const root = document.getElementById('root');
const bootFallback = document.getElementById('boot-fallback');
if (bootFallback) bootFallback.remove();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
