// src/App.tsx
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { SetupScreen } from './components/SetupScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { useWalletWorker } from './hooks/useWalletWorker';
import { ExternalPayScreen } from './components/ExternalPayScreen';

const WelcomeScreen = () => {
  const navigate = useNavigate();
  const { sendCommand } = useWalletWorker();

  const hasVault = !!localStorage.getItem('wallet_vault');
  const hasActiveSession = !!localStorage.getItem('wallet_pubkey');

  // Unlock state if a vault is already saved locally
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  // If already logged in / active session exists, skip straight to dashboard
  if (hasVault && hasActiveSession) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError('');
    setIsUnlocking(true);

    const vault = localStorage.getItem('wallet_vault');
    if (!vault) return;

    try {
      // Send the stored vault and password to the worker to decrypt and unlock
      const res = await sendCommand<{ publicKey: string }>('LOGIN', { password, vault });
      
      // Save the active session public key and navigate to dashboard
      localStorage.setItem('wallet_pubkey', res.publicKey);
      navigate('/dashboard');
    } catch (err: unknown) {
      setUnlockError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setIsUnlocking(false);
    }
  };

  // If a vault exists on this device, show the Unlock/Password prompt instead of Setup
  if (hasVault) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-purple-500">Welcome Back</h1>
        <p className="mb-6 text-gray-400 text-sm text-center">Enter your password to unlock your vault.</p>
        
        <form onSubmit={handleUnlock} className="w-full bg-gray-800 p-6 rounded-xl border border-gray-700">
          <input 
            type="password" 
            placeholder="Local Password" 
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white focus:outline-none focus:border-purple-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {unlockError && <p className="text-red-500 text-sm mb-4">{unlockError}</p>}
          <button 
            type="submit" 
            disabled={isUnlocking || !password}
            className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition disabled:opacity-50"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock Vault'}
          </button>
        </form>
      </div>
    );
  }

  // Default view if no vault exists at all (brand new user)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold mb-6 text-purple-500">Vault Wallet</h1>
      <p className="mb-8 text-gray-400">A secure, non-custodial Solana web wallet.</p>
      <button onClick={() => navigate('/setup')} className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-semibold transition">
        Enter Vault
      </button>
    </div>
  );
};

function App() {
  return (
    <Router>
      <div className="bg-gray-900 text-white font-sans min-h-screen">
        <Routes>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/setup" element={<SetupScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/pay" element={<ExternalPayScreen />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;