// src/hooks/useSolana.ts
import { useState, useCallback } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Initialize connection to Devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

export function useSolana(publicKeyString: string | null) {
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [splBalance, setSplBalance] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBalances = useCallback(async (splMintAddress?: string) => {
    if (!publicKeyString) return;
    
    setIsRefreshing(true);
    try {
      const pubkey = new PublicKey(publicKeyString);
      
      // Fetch Native SOL
      const balance = await connection.getBalance(pubkey);
      setSolBalance(balance / LAMPORTS_PER_SOL);

      // Fetch SPL Token (if mint address is provided)
      if (splMintAddress) {
        const parsedAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
          mint: new PublicKey(splMintAddress)
        });
        
        if (parsedAccounts.value.length > 0) {
          setSplBalance(parsedAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount);
        } else {
          setSplBalance(0); // ATA doesn't exist or is empty
        }
      }
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [publicKeyString]);

  return { solBalance, splBalance, isRefreshing, fetchBalances, connection };
}