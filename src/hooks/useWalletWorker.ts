// src/hooks/useWalletWorker.ts
import { useEffect, useRef, useCallback } from 'react';
import type { WorkerCommand, WorkerResponse } from '../types/worker';

// Singleton instance so we don't spawn multiple workers on re-renders
let workerInstance: Worker | null = null;

export function useWalletWorker() {
  const workerRef = useRef<Worker | null>(null);
  // Store pending promises mapped by messageId so we can resolve them when the worker replies
  const pendingRequests = useRef<Map<string, { resolve: (data: unknown) => void, reject: (err: unknown) => void }>>(new Map());

  useEffect(() => {
    if (!workerInstance) {
      // Instantiate the worker using Vite's ?worker syntax
      workerInstance = new Worker(new URL('../worker/wallet.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    workerRef.current = workerInstance;

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const { messageId, success, data, error, errorCode } = event.data;
      const request = pendingRequests.current.get(messageId);
      
      if (request) {
        if (success) {
          request.resolve(data);
        } else {
          console.error(`[Worker Error ${errorCode}]`, error);
          request.reject(new Error(error || 'Worker operation failed'));
        }
        pendingRequests.current.delete(messageId);
      }
    };

    workerRef.current.addEventListener('message', handleMessage);

    return () => {
      workerRef.current?.removeEventListener('message', handleMessage);
    };
  }, []);

  const sendCommand = useCallback(<T = unknown>(command: WorkerCommand, payload?: unknown): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        return reject(new Error('Worker not initialized'));
      }

      const messageId = crypto.randomUUID();
      pendingRequests.current.set(messageId, { resolve: resolve as (data: unknown) => void, reject });

      workerRef.current.postMessage({
        command,
        payload,
        messageId,
      });
    });
  }, []);

  return { sendCommand };
}