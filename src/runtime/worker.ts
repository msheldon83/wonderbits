/// <reference lib="webworker" />
import { critique } from '../create/critic';
import type { CritiqueRequest, LiveRequest, RunRequest } from './contract';
import { createLiveHost, handleRequest } from './host';

declare const self: DedicatedWorkerGlobalScope;

const live = createLiveHost();

self.addEventListener('message', (e: MessageEvent<RunRequest | CritiqueRequest | LiveRequest>) => {
  const post = (m: Parameters<Parameters<typeof live>[1]>[0]) => self.postMessage(m);
  if (e.data?.type === 'run') handleRequest(e.data, post);
  else if (e.data?.type === 'critique') self.postMessage({ type: 'critique', requestId: e.data.requestId, critique: critique(e.data) });
  else if (e.data?.type === 'live-start' || e.data?.type === 'live-input' || e.data?.type === 'live-stop') live(e.data, post);
});
