/**
 * Client side of the runtime contract. It sends a run request, collects the
 * streamed trace, and enforces the wall-clock limit by terminating the
 * endpoint and starting a fresh one.
 */
import {
  CONTRACT_VERSION,
  type RunRequest,
  type RunResult,
  type Runtime,
  type RuntimeMessage,
  type TraceEvent,
} from './contract';

/** The minimal surface of a Worker (or iframe bridge) the client needs. */
export interface Endpoint {
  postMessage(message: RunRequest): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<RuntimeMessage>) => void): void;
  removeEventListener(type: 'message', listener: (e: MessageEvent<RuntimeMessage>) => void): void;
  terminate(): void;
}

let counter = 0;
const nextRequestId = () => `run-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function createRuntimeClient(createEndpoint: () => Endpoint): Runtime {
  let endpoint: Endpoint | null = null;
  const ensure = () => (endpoint ??= createEndpoint());

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
          } else {
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
    dispose() {
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
