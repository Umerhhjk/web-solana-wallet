// src/worker/wallet.worker.ts
import { Keypair, Transaction } from '@solana/web3.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { ERRORS } from '../types/worker';
import type { WorkerMessage, WorkerResponse } from '../types/worker';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- In-Memory State (Wiped on logout or timeout) ---
let activeKeypair: Keypair | null = null;
let sessionTimeoutId: ReturnType<typeof setTimeout> | null = null;

const SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// --- Helper: Session Management ---
function startSessionTimer() {
  if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
  sessionTimeoutId = setTimeout(() => {
    activeKeypair = null; // Wipe keypair
    sessionTimeoutId = null;
    console.log('[Worker Log] - Session expired. Keypair wiped from memory.');
  }, SESSION_DURATION_MS);
}

function clearSession() {
  activeKeypair = null;
  if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
  sessionTimeoutId = null;
}

// --- Cryptography: PBKDF2 + AES-GCM ---
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      // Explicitly cast to unknown then BufferSource to satisfy strict TS DOM libs
      salt: salt as unknown as BufferSource,
      iterations: 600000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(password: string, data: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  const packed = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode(...packed));
}

async function decryptData(password: string, vault: string): Promise<string> {
  const packed = Uint8Array.from(atob(vault), c => c.charCodeAt(0));
  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const ciphertext = packed.slice(28);

  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// --- Solana Derivation ---
function deriveKeypairFromSeed(seedHex: string): Keypair {
  const derivationPath = "m/44'/501'/0'/0'";
  const derivedSeed = derivePath(derivationPath, seedHex).key;
  return Keypair.fromSeed(derivedSeed);
}

// --- Message Router ---
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { command, payload, messageId } = event.data;

  // Use a generic type with an optional parameter to fix the "Expected 0 arguments" error
  const sendSuccess = <T = Record<string, unknown>>(data?: T) => 
    self.postMessage({ messageId, success: true, data } as WorkerResponse<T>);
    
  const sendError = (errorCode: string, errorMsg: string) => 
    self.postMessage({ messageId, success: false, error: errorMsg, errorCode } as WorkerResponse);

  try {
    switch (command) {
      
      case 'INIT_WALLET': {
        // @ts-expect-error - We will strictly type payloads in Phase 3
        const { password } = payload;
        const mnemonic = generateMnemonic(wordlist, 128); 
        const seed = bytesToHex(mnemonicToSeedSync(mnemonic));
        
        activeKeypair = deriveKeypairFromSeed(seed);
        startSessionTimer();

        const secretData = JSON.stringify({ type: 'mnemonic', secret: mnemonic });
        const vault = await encryptData(password, secretData);

        sendSuccess({ 
          vault, 
          publicKey: activeKeypair.publicKey.toBase58(),
          mnemonic 
        });
        break;
      }

      case 'IMPORT_WALLET': {
        // @ts-expect-error - We will strictly type payloads in Phase 3
        const { password, secret, isMnemonic } = payload;
        
        if (isMnemonic) {
          if (!validateMnemonic(secret, wordlist)) {
            return sendError(ERRORS.INVALID_MNEMONIC, 'Invalid seed phrase');
          }
          const seed = bytesToHex(mnemonicToSeedSync(secret));
          activeKeypair = deriveKeypairFromSeed(seed);
        } else {
          try {
            const decoded = bs58.decode(secret);
            if (decoded.length !== 64) throw new Error();
            activeKeypair = Keypair.fromSecretKey(decoded);
          } catch {
            return sendError(ERRORS.INVALID_PRIVATE_KEY, 'Invalid Base58 private key');
          }
        }

        startSessionTimer();
        const secretData = JSON.stringify({ type: isMnemonic ? 'mnemonic' : 'privateKey', secret });
        const vault = await encryptData(password, secretData);

        sendSuccess({ vault, publicKey: activeKeypair.publicKey.toBase58() });
        break;
      }

      case 'LOGIN': {
        // @ts-expect-error - We will strictly type payloads in Phase 3
        const { password, vault } = payload;
        try {
          const decrypted = await decryptData(password, vault);
          const parsed = JSON.parse(decrypted);

          if (parsed.type === 'mnemonic') {
            const seed = bytesToHex(mnemonicToSeedSync(parsed.secret));
            activeKeypair = deriveKeypairFromSeed(seed);
          } else {
            activeKeypair = Keypair.fromSecretKey(bs58.decode(parsed.secret));
          }

          startSessionTimer();
          sendSuccess({ publicKey: activeKeypair.publicKey.toBase58() });
        } catch {
          sendError(ERRORS.DECRYPTION_FAILED, 'Incorrect password');
        }
        break;
      }

      case 'SIGN_TRANSACTION': {
        if (!activeKeypair) return sendError(ERRORS.SESSION_EXPIRED, 'Session expired. Please log in again.');
        
        startSessionTimer(); // Reset the 15-minute timer on activity
        
        // @ts-expect-error - We will strictly type payloads in Phase 3
        const { transactionBytesBase58 } = payload;
        
        try {
          // Decode the Base58 string back into raw bytes and build the transaction
          const txBytes = bs58.decode(transactionBytesBase58);
          const transaction = Transaction.from(txBytes);
          
          // Sign securely using the isolated private key
          transaction.partialSign(activeKeypair);
          
          // Serialize and encode the signed bytes to send back to the main thread
          const signedBytes = transaction.serialize();
          const signedTransactionBase58 = bs58.encode(signedBytes);
          
          sendSuccess({ signedTransactionBase58 });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Signing failed';
          sendError(ERRORS.INTERNAL_ERROR, errorMsg);
        }
        break;
      }

      case 'EXPORT_SECRET': {
        if (!activeKeypair) return sendError(ERRORS.SESSION_EXPIRED, 'Session expired. Please log in again.');
        
        // @ts-expect-error - We will strictly type payloads in Phase 3
        const { password, vault } = payload;
        try {
          const decrypted = await decryptData(password, vault);
          const parsed = JSON.parse(decrypted);
          sendSuccess({ secret: parsed.secret, type: parsed.type, privateKeyBase58: bs58.encode(activeKeypair.secretKey) });
        } catch {
          sendError(ERRORS.DECRYPTION_FAILED, 'Incorrect password');
        }
        break;
      }

      case 'LOGOUT': {
        clearSession();
        sendSuccess();
        break;
      }

      default:
        sendError(ERRORS.INVALID_PAYLOAD, 'Unknown command');
    }
  } catch (err: unknown) {
    console.error('[Worker Error]', err);
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    sendError(ERRORS.INTERNAL_ERROR, errorMsg);
  }
};