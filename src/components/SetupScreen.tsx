// src/components/SetupScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, ArrowLeft, AlertCircle } from 'lucide-react';
import { useWalletWorker } from '../hooks/useWalletWorker';
import { validatePassword } from '../utils/password';

type SetupMode = 'select' | 'create' | 'import';
type ImportType = 'mnemonic' | 'privateKey';

export const SetupScreen = () => {
  const navigate = useNavigate();
  const { sendCommand } = useWalletWorker();
  
  const [mode, setMode] = useState<SetupMode>('select');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Create Wallet State
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  
  // Import Wallet State
  const [importType, setImportType] = useState<ImportType>('mnemonic');
  const [importSecret, setImportSecret] = useState('');

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const passCheck = validatePassword(password);
    if (!passCheck.isValid) return setError(passCheck.error);

    setLoading(true);
    try {
      const res = await sendCommand<{ vault: string; publicKey: string; mnemonic: string }>('INIT_WALLET', { password });
      localStorage.setItem('wallet_vault', res.vault);
      localStorage.setItem('wallet_pubkey', res.publicKey);
      setGeneratedMnemonic(res.mnemonic);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleImportWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const passCheck = validatePassword(password);
    if (!passCheck.isValid) return setError(passCheck.error);
    if (!importSecret.trim()) return setError('Please enter your secret.');

    setLoading(true);
    try {
      const res = await sendCommand<{ vault: string; publicKey: string }>('IMPORT_WALLET', { 
        password, 
        secret: importSecret.trim(), 
        isMnemonic: importType === 'mnemonic' 
      });
      localStorage.setItem('wallet_vault', res.vault);
      localStorage.setItem('wallet_pubkey', res.publicKey);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedMnemonic);
  };

  if (generatedMnemonic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-4 text-green-400">Wallet Created!</h2>
        <div className="bg-gray-800 p-6 rounded-lg w-full mb-6 border border-gray-700">
          <p className="text-red-400 text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertCircle size={16} /> Write down these 12 words. Do not lose them!
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {generatedMnemonic.split(' ').map((word, i) => (
              <div key={i} className="bg-gray-900 p-2 rounded text-center text-sm text-gray-300 font-mono">
                <span className="text-gray-600 mr-2">{i + 1}</span>{word}
              </div>
            ))}
          </div>
          <button onClick={copyToClipboard} className="text-purple-400 hover:text-purple-300 flex items-center gap-2 text-sm">
            <Copy size={16} /> Copy to clipboard
          </button>
        </div>
        <button 
          onClick={() => navigate('/dashboard')}
          className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition"
        >
          I have saved my words safely
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 max-w-md mx-auto w-full">
      {mode !== 'select' && (
        <button onClick={() => { setMode('select'); setError(''); }} className="self-start mb-6 text-gray-400 hover:text-white flex items-center gap-2">
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {mode === 'select' && (
        <div className="w-full space-y-4">
          <h2 className="text-3xl font-bold text-center mb-8">Setup Wallet</h2>
          <button onClick={() => setMode('create')} className="w-full bg-purple-600 hover:bg-purple-700 py-4 rounded-lg font-semibold transition text-lg">
            Create New Wallet
          </button>
          <button onClick={() => setMode('import')} className="w-full bg-gray-800 hover:bg-gray-700 py-4 rounded-lg font-semibold transition text-lg border border-gray-700">
            Import Existing Wallet
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={handleCreateWallet} className="w-full bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Create Password</h2>
          <p className="text-gray-400 text-sm mb-4">Protect your new wallet on this device.</p>
          <input 
            type="password" 
            placeholder="Secure Password" 
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white focus:outline-none focus:border-purple-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <button disabled={loading} type="submit" className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition disabled:opacity-50">
            {loading ? 'Encrypting...' : 'Generate Wallet'}
          </button>
        </form>
      )}

      {mode === 'import' && (
        <form onSubmit={handleImportWallet} className="w-full bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Import Wallet</h2>
          
          <div className="flex bg-gray-900 p-1 rounded-lg mb-6">
            <button type="button" onClick={() => setImportType('mnemonic')} className={`flex-1 py-2 text-sm font-semibold rounded-md ${importType === 'mnemonic' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Seed Phrase</button>
            <button type="button" onClick={() => setImportType('privateKey')} className={`flex-1 py-2 text-sm font-semibold rounded-md ${importType === 'privateKey' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Private Key</button>
          </div>

          <textarea 
            placeholder={importType === 'mnemonic' ? "Enter 12-word seed phrase" : "Enter Base58 private key"} 
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white focus:outline-none focus:border-purple-500 h-24 resize-none"
            value={importSecret}
            onChange={(e) => setImportSecret(e.target.value)}
          />

          <input 
            type="password" 
            placeholder="New local password" 
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white focus:outline-none focus:border-purple-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          
          <button disabled={loading} type="submit" className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition disabled:opacity-50">
            {loading ? 'Importing & Encrypting...' : 'Import Wallet'}
          </button>
        </form>
      )}
    </div>
  );
};