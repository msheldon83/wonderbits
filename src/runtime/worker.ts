/// <reference lib="webworker" />
import { critique } from '../create/critic';
import type { CritiqueRequest, RunRequest } from './contract';
import { handleRequest } from './host';

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (e: MessageEvent<RunRequest | CritiqueRequest>) => {
  if (e.data?.type === 'run') handleRequest(e.data, (m) => self.postMessage(m));
  else if (e.data?.type === 'critique') self.postMessage({ type: 'critique', requestId: e.data.requestId, critique: critique(e.data) });
});
