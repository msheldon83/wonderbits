/// <reference lib="webworker" />
import type { RunRequest } from './contract';
import { handleRequest } from './host';

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (e: MessageEvent<RunRequest>) => {
  if (e.data?.type === 'run') handleRequest(e.data, (m) => self.postMessage(m));
});
