// src/types/worker.ts

export type WorkerCommand = 
  | 'INIT_WALLET' 
  | 'IMPORT_WALLET' 
  | 'LOGIN' 
  | 'SIGN_TRANSACTION' 
  | 'EXPORT_SECRET' 
  | 'LOGOUT';

export interface WorkerMessage<T = unknown> {
  command: WorkerCommand;
  payload?: T;
  messageId: string;
}

export interface WorkerResponse<T = unknown> {
  messageId: string;
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// Error Codes
export const ERRORS = {
  DECRYPTION_FAILED: 'ERR_DECRYPTION_FAILED',
  SESSION_EXPIRED: 'ERR_SESSION_EXPIRED',
  INVALID_PAYLOAD: 'ERR_INVALID_PAYLOAD',
  INTERNAL_ERROR: 'ERR_INTERNAL_ERROR',
  INVALID_MNEMONIC: 'ERR_INVALID_MNEMONIC',
  INVALID_PRIVATE_KEY: 'ERR_INVALID_PRIVATE_KEY'
};