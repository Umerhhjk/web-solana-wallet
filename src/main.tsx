import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Buffer } from 'buffer'

// Extend the global Window interface for strict TypeScript compatibility
declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

// Polyfill Buffer for Solana Web3 libraries
window.Buffer = Buffer

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)