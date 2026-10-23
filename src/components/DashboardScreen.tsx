// src/components/DashboardScreen.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, RefreshCw, Key, LogOut, CheckCircle2, EyeOff, Send } from 'lucide-react';
import { useWalletWorker } from '../hooks/useWalletWorker';
import { useSolana } from '../hooks/useSolana';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

export const DashboardScreen = () => {
  const navigate = useNavigate();
  const { sendCommand } = useWalletWorker();
  
  const vault = localStorage.getItem('wallet_vault');
  const pubkey = localStorage.getItem('wallet_pubkey');
  
  const { solBalance, splBalance, isRefreshing, fetchBalances, connection } = useSolana(pubkey);
  
  // A standard SPL Devnet Token (e.g., USDC Devnet). You can replace this with your own Mint!
  const TEST_SPL_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; 

  const [copied, setCopied] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [password, setPassword] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportedSecret, setExportedSecret] = useState<{ type: string, secret: string, privateKeyBase58: string } | null>(null);

  // Send Token State
  const [recipientAddress, setRecipientAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [txSignature, setTxSignature] = useState('');

  // Re-authentication State
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');

  useEffect(() => {
    if (!vault || !pubkey) {
      navigate('/setup');
      return; // Return empty to satisfy TypeScript
    }
    fetchBalances(TEST_SPL_MINT);
  }, [vault, pubkey, fetchBalances, navigate]);

  const handleCopy = () => {
    if (!pubkey) return;
    navigator.clipboard.writeText(pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    await sendCommand('LOGOUT');
    localStorage.removeItem('wallet_vault');
    localStorage.removeItem('wallet_pubkey');
    navigate('/');
  };

  const executeTransaction = async (overridePassword?: string) => {
    if (!pubkey || !TEST_SPL_MINT) return;
    setIsSending(true);
    setSendError('');
    setTxSignature('');

    try {
      if (overridePassword) {
        await sendCommand('LOGIN', { password: overridePassword, vault });
        setShowReauthModal(false);
        setReauthPassword('');
      }

      const sender = new PublicKey(pubkey);
      const recipient = new PublicKey(recipientAddress);
      const mint = new PublicKey(TEST_SPL_MINT);
      
      const senderAta = await getAssociatedTokenAddress(mint, sender);
      const recipientAta = await getAssociatedTokenAddress(mint, recipient);
      
      const transaction = new Transaction();
      
      // 1. Check Recipient ATA
      const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
      if (!recipientAtaInfo) {
        transaction.add(createAssociatedTokenAccountInstruction(sender, recipientAta, recipient, mint));
      }

      // 2. Fetch Mint Decimals Dynamically to ensure math is accurate
      const mintInfo = await connection.getParsedAccountInfo(mint);
      if (!mintInfo.value || !('parsed' in mintInfo.value.data)) throw new Error('Invalid mint address');
      const decimals = mintInfo.value.data.parsed.info.decimals;
      
      // 3. Construct Transfer Instruction
      const amountToTransfer = Math.floor(parseFloat(sendAmount) * Math.pow(10, decimals));
      transaction.add(createTransferInstruction(senderAta, recipientAta, sender, amountToTransfer));
      
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = sender;
      
      // 4. Serialize Unsigned & Send to Secure Worker
      const txBytes = transaction.serialize({ requireAllSignatures: false });
      const transactionBytesBase58 = bs58.encode(txBytes);
      
      try {
        const { signedTransactionBase58 } = await sendCommand<{ signedTransactionBase58: string }>('SIGN_TRANSACTION', { transactionBytesBase58 });
        
        // 5. Broadcast the returned Signed Transaction
        const signedBytes = bs58.decode(signedTransactionBase58);
        const signature = await connection.sendRawTransaction(signedBytes);
        
        setTxSignature(signature);
        setRecipientAddress('');
        setSendAmount('');
        fetchBalances(TEST_SPL_MINT);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Transaction failed';
        if (errorMsg.includes('Session expired')) {
          setShowReauthModal(true);
          return;
        }
        // Attach the original error as the cause
        throw new Error(errorMsg, { cause: err });
      }
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      if (!showReauthModal) setIsSending(false);
    }
  };

  const handleViewPrivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setExportError('');
    try {
      const res = await sendCommand<{ secret: string, type: string, privateKeyBase58: string }>('EXPORT_SECRET', { password, vault });
      setExportedSecret(res);
      setPassword(''); 
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Decryption failed');
    }
  };

  const closeExportModal = () => {
    setExportedSecret(null); // CRITICAL: Wipe from state
    setPassword('');
    setExportError('');
    setShowExportModal(false);
  };

  if (!pubkey) return null;

  return (
    <div className="flex flex-col items-center min-h-screen p-4 max-w-2xl mx-auto w-full pb-20">
      <header className="w-full flex justify-between items-center mb-8 mt-4">
        <h1 className="text-2xl font-bold text-purple-500">Vault Dashboard</h1>
        <button onClick={handleLogout} className="text-gray-400 hover:text-red-400 flex items-center gap-2 transition">
          <LogOut size={18} /> Logout
        </button>
      </header>

      {/* Account Info Card */}
      <div className="w-full bg-gray-800 p-6 rounded-xl border border-gray-700 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Devnet Address</span>
          <button onClick={() => setShowExportModal(true)} className="text-xs flex items-center gap-1 text-gray-400 hover:text-purple-400 transition">
            <Key size={14} /> View Secret
          </button>
        </div>
        <div className="flex items-center justify-between bg-gray-900 p-3 rounded-lg border border-gray-700">
          <code className="text-sm text-gray-300 truncate mr-4">{pubkey}</code>
          <button onClick={handleCopy} className="text-purple-400 hover:text-purple-300 flex-shrink-0">
            {copied ? <CheckCircle2 size={18} className="text-green-400" /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {/* Balances Card */}
      <div className="w-full bg-gray-800 p-6 rounded-xl border border-gray-700 relative mb-6">
        <button onClick={() => fetchBalances(TEST_SPL_MINT)} disabled={isRefreshing} className="absolute top-6 right-6 text-gray-400 hover:text-white transition disabled:opacity-50">
          <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
        <h2 className="text-xl font-bold mb-6">Balances</h2>
        <div className="space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold">S</div>
              <span className="font-semibold">Solana (SOL)</span>
            </div>
            <span className="text-xl font-mono">{solBalance !== null ? solBalance.toFixed(4) : '---'}</span>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">T</div>
              <span className="font-semibold">Test Token (SPL)</span>
            </div>
            <span className="text-xl font-mono">{splBalance !== null ? splBalance.toFixed(2) : '0.00'}</span>
          </div>
        </div>
      </div>

      {/* Send Token Form */}
      <div className="w-full bg-gray-800 p-6 rounded-xl border border-gray-700 mb-6">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Send size={20}/> Send SPL Token</h2>
        <form onSubmit={(e) => { e.preventDefault(); executeTransaction(); }}>
          <label className="block text-sm text-gray-400 mb-1">Recipient Address</label>
          <input 
            type="text" 
            placeholder="Base58 Public Key" 
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white focus:outline-none focus:border-purple-500 font-mono text-sm"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
          />
          <label className="block text-sm text-gray-400 mb-1">Amount</label>
          <input 
            type="number" 
            step="any"
            placeholder="0.00" 
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-6 text-white focus:outline-none focus:border-purple-500"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
          />
          
          {sendError && <p className="text-red-500 text-sm mb-4">{sendError}</p>}
          {txSignature && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-800 rounded-lg text-sm text-green-400 break-all">
              Success! Tx: <a href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`} target="_blank" rel="noreferrer" className="underline hover:text-green-300">{txSignature}</a>
            </div>
          )}

          <button disabled={isSending || !recipientAddress || !sendAmount} type="submit" className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition disabled:opacity-50">
            {isSending ? 'Processing...' : 'Sign & Send'}
          </button>
        </form>
      </div>

      {/* Re-Auth Modal (Triggered on Session Timeout) */}
      {showReauthModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Session Expired</h2>
            <form onSubmit={(e) => { e.preventDefault(); setIsSending(true); executeTransaction(reauthPassword); }}>
              <p className="text-gray-400 text-sm mb-4">Your 15-minute secure session has ended. Please enter your password to sign this transaction.</p>
              <input 
                type="password" 
                placeholder="Local Password" 
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-6 text-white focus:outline-none focus:border-purple-500"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                autoFocus
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowReauthModal(false); setIsSending(false); }} className="flex-1 py-3 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600 transition">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 transition">Authenticate & Send</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Secret Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">View Secret Key</h2>
            {!exportedSecret ? (
              <form onSubmit={handleViewPrivateKey}>
                <p className="text-gray-400 text-sm mb-4">Enter your password to temporarily view your private key.</p>
                <input 
                  type="password" 
                  placeholder="Local Password" 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-4 text-white focus:outline-none focus:border-purple-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                {exportError && <p className="text-red-500 text-sm mb-4">{exportError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={closeExportModal} className="flex-1 py-3 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600 transition">Cancel</button>
                  <button type="submit" className="flex-1 py-3 rounded-lg font-semibold bg-red-600 hover:bg-red-700 transition">Decrypt</button>
                </div>
              </form>
            ) : (
              <div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-1">Base58 Private Key</label>
                  <div className="bg-gray-900 p-3 rounded-lg border border-gray-700 break-all font-mono text-sm text-red-400">{exportedSecret.privateKeyBase58}</div>
                </div>
                {exportedSecret.type === 'mnemonic' && (
                  <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-1">Recovery Phrase</label>
                    <div className="bg-gray-900 p-3 rounded-lg border border-gray-700 font-mono text-sm text-red-400">{exportedSecret.secret}</div>
                  </div>
                )}
                <button onClick={closeExportModal} className="w-full py-3 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600 transition flex items-center justify-center gap-2">
                  <EyeOff size={18} /> Hide & Secure
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};