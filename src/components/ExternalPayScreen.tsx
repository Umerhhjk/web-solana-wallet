// src/components/ExternalPayScreen.tsx
import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { useWalletWorker } from '../hooks/useWalletWorker';
import { useSolana } from '../hooks/useSolana';
import bs58 from 'bs58';

export const ExternalPayScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { sendCommand } = useWalletWorker();

  const vault = localStorage.getItem('wallet_vault');
  const pubkey = localStorage.getItem('wallet_pubkey');
  const { connection } = useSolana(pubkey);

  const uri = searchParams.get('uri');
  const redirectUrl = searchParams.get('redirect');

  // Lazy initialization fixes the set-state-in-effect lint error
  const [parsedData] = useState<{ recipient: string; amount: string; mint: string; reference: string } | null>(() => {
    if (!uri) return null;
    try {
      // Decode if it's still URI-encoded
      const decodedUri = decodeURIComponent(uri);
      if (!decodedUri.startsWith('solana:')) return null;

      // Extract recipient and query parameters correctly without pathname issues
      const [addressPart, queryString] = decodedUri.replace('solana:', '').split('?');
      const recipient = addressPart.replace(/^\/+/, ''); // Clean any slashes
      const searchParamsObj = new URLSearchParams(queryString);

      const amount = searchParamsObj.get('amount');
      const mint = searchParamsObj.get('spl-token');
      const reference = searchParamsObj.get('reference');

      if (!recipient || !amount || !mint || !reference) return null;
      return { recipient, amount, mint, reference };
    } catch {
      return null;
    }
  });

  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!vault || !pubkey) {
    navigate('/setup');
    return null;
  }

  if (!parsedData) {
    return <div className="min-h-screen bg-gray-900 text-white p-8">Invalid or missing payment request URI.</div>;
  }

  const handleSignAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedData || !pubkey) return;

    setIsProcessing(true);
    try {
      setStatus('Unlocking vault via Web Worker...');
      await sendCommand('LOGIN', { password, vault });

      setStatus('Building transaction...');
      const sender = new PublicKey(pubkey);
      const recipient = new PublicKey(parsedData.recipient);
      const mint = new PublicKey(parsedData.mint);

      const senderAta = await getAssociatedTokenAddress(mint, sender);
      const recipientAta = await getAssociatedTokenAddress(mint, recipient);

      const transaction = new Transaction();

      const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
      if (!recipientAtaInfo) {
        transaction.add(createAssociatedTokenAccountInstruction(sender, recipientAta, recipient, mint));
      }

      const mintInfo = await connection.getParsedAccountInfo(mint);
      if (!mintInfo.value || !('parsed' in mintInfo.value.data)) throw new Error('Invalid mint');
      const decimals = mintInfo.value.data.parsed.info.decimals;

      const transferAmount = Math.floor(parseFloat(parsedData.amount) * Math.pow(10, decimals));
      const transferInstruction = createTransferInstruction(senderAta, recipientAta, sender, transferAmount);

      transferInstruction.keys.push({
        pubkey: new PublicKey(parsedData.reference),
        isSigner: false,
        isWritable: false,
      });

      transaction.add(transferInstruction);
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = sender;

      setStatus('Signing transaction in secure worker...');
      const txBytes = transaction.serialize({ requireAllSignatures: false });
      const transactionBytesBase58 = bs58.encode(txBytes);

      const { signedTransactionBase58 } = await sendCommand<{ signedTransactionBase58: string }>('SIGN_TRANSACTION', { transactionBytesBase58 });

      setStatus('Broadcasting transaction to Devnet...');
      const signedBytes = bs58.decode(signedTransactionBase58);
      const signature = await connection.sendRawTransaction(signedBytes);
      await connection.confirmTransaction(signature, 'confirmed');

      setStatus('Payment successful! Returning to store...');

      setTimeout(() => {
        if (redirectUrl) {
          window.location.href = decodeURIComponent(redirectUrl);
        } else {
          navigate('/');
        }
      }, 1500);

    } catch (err: unknown) {
      setStatus(`Payment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 max-w-md mx-auto flex flex-col justify-center">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4 shadow-xl">
        <h1 className="text-2xl font-bold text-purple-400">Approve Checkout Payment</h1>
        
        <div className="space-y-2 text-sm bg-gray-900 p-4 rounded-lg border border-gray-700 font-mono">
          <p><span className="text-gray-400">To:</span> {parsedData.recipient.slice(0, 6)}...{parsedData.recipient.slice(-6)}</p>
          <p><span className="text-gray-400">Amount:</span> <span className="text-green-400">{parsedData.amount} Tokens</span></p>
        </div>

        <form onSubmit={handleSignAndPay} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Vault Password</label>
            <input
              type="password"
              placeholder="Enter password to sign"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-sm text-white focus:outline-none focus:border-purple-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isProcessing || !password}
            className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold transition disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Authorize & Pay'}
          </button>
        </form>

        {status && <p className="text-xs text-center text-purple-300 font-mono">{status}</p>}
      </div>
    </div>
  );
};