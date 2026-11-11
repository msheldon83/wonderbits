/**
 * Client side of the runtime contract. It sends a run request, collects the
 * streamed trace, and enforces the wall-clock limit by terminating the
 * endpoint and starting a fresh one.
 */
import {
  CONTRACT_VERSION,
  type Critique,
  type CritiqueRequest,
  type RunRequest,
  type RunResult,
  type Runtime,
  type RuntimeMessage,
  type TraceEvent,
} from './contract';

/** The minimal surface of a Worker (or iframe bridge) the client needs. */
export interface Endpoint {
  postMessage(message: RunRequest | CritiqueRequest): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<RuntimeMessage>) => void): void;
  removeEventListener(type: 'message', listener: (e: MessageEvent<RuntimeMessage>) => void): void;
  terminate(): void;
}

let counter = 0;
const nextRequestId = () => `run-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Beyond the search's own limit: time to start the endpoint and to run the maker's program. */
const CRITIQUE_GRACE_MILLIS = 3000;

export function createRuntimeClient(createEndpoint: () => Endpoint): Runtime {
  let endpoint: Endpoint | null = null;
  const ensure = () => (endpoint ??= createEndpoint());
  /** The critic's own endpoint, so a long search never holds up a run. */
  let critic: Endpoint | null = null;

  return {
    run(input) {
      const request: RunRequest = { type: 'run', contract: CONTRACT_VERSION, requestId: nextRequestId(), ...input };
      const ep = ensure();
      return new Promise<RunResult>((resolve) => {
        const trace: TraceEvent[] = [];
        const finish = (result: RunResult) => {
          clearTimeout(timer);
          ep.removeEventListener('message', onMessage);
          resolve(result);
        };
        const onMessage = (e: MessageEvent<RuntimeMessage>) => {
          const m = e.data;
          if (m.requestId !== request.requestId) return;
          if (m.type === 'trace') {
            trace.push(m.event);
            if (trace.length > input.limits.maxSteps) {
              // A misbehaving runtime ignored its step limit.
              ep.terminate();
              endpoint = null;
              finish({ trace: trace.slice(0, input.limits.maxSteps), outcome: { status: 'halted', reason: 'step-limit' }, final: null, executedSteps: input.limits.maxSteps });
            }
          } else if (m.type === 'done') {
            finish({ trace, outcome: m.outcome, final: m.final, executedSteps: m.executedSteps });
          }
        };
        const timer = setTimeout(() => {
          ep.terminate();
          endpoint = null;
          finish({ trace, outcome: { status: 'halted', reason: 'time-limit' }, final: null, executedSteps: trace.length });
        }, input.limits.maxMillis);
        ep.addEventListener('message', onMessage);
        ep.postMessage(request);
      });
    },
    critique(input) {
      const request: CritiqueRequest = { type: 'critique', contract: CONTRACT_VERSION, requestId: nextRequestId(), ...input };
      // A fresh question makes the last one stale: stop it, and ask on a new endpoint.
      critic?.terminate();
      const ep = (critic = createEndpoint());
      return new Promise<Critique | null>((resolve) => {
        const finish = (critique: Critique | null) => {
          clearTimeout(timer);
          ep.removeEventListener('message', onMessage);
          if (critic === ep) {
            ep.terminate();
            critic = null;
          }
          resolve(critique);
        };
        const onMessage = (e: MessageEvent<RuntimeMessage>) => {
          if (e.data.requestId === request.requestId && e.data.type === 'critique') finish(e.data.critique);
        };
        // The search stops itself at searchMillis; this is for a critic that does not.
        const timer = setTimeout(() => finish(null), input.searchMillis + CRITIQUE_GRACE_MILLIS);
        ep.addEventListener('message', onMessage);
        ep.postMessage(request);
      });
    },
    dispose() {
      critic?.terminate();
      critic = null;
      endpoint?.terminate();
      endpoint = null;
    },
  };
}

/** The Phase 1 runtime: the IR interpreter in a module Worker. */
export function createWorkerRuntime(): Runtime {
  return createRuntimeClient(
    () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'wonderbits-runtime' }) as unknown as Endpoint,
  );
}
