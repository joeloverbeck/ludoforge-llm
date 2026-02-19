import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initializeAnimationRuntime } from './animation/bootstrap-runtime.js';
import { App } from './App.js';
import './ui/tokens.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Runner root element not found');
}

initializeAnimationRuntime();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
