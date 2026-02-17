import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './ui/tokens.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Runner root element not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
