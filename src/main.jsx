import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (import.meta.env.PROD) {
  // Clear the console
  setTimeout(console.clear, 100);

  // Disable console methods
  ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    console[method] = () => {};
  });

  // Block devtools shortcuts
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'F12' || 
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) || 
      (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(e.key))
    ) {
      e.preventDefault();
      return false;
    }
  });

  // Block right-click (context menu)
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
