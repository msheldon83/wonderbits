/**
 * Runtime host: the code on the far side of the contract. Kept separate from
 * the Worker global so it can be tested over a plain MessageChannel.
 */
import { CONTRACT_VERSION, type RunRequest, type RuntimeMessage } from './contract';
import { interpret } from './interpreter';

export type Post = (message: RuntimeMessage) => void;

export function handleRequest(request: RunRequest, post: Post): void {
  const { requestId } = request;
  if (request.contract !== CONTRACT_VERSION) {
    post({
      type: 'done',
      requestId,
      outcome: { status: 'error', message: `Unsupported contract version ${String(request.contract)}` },
      final: { robot: request.world.robot, collected: [], open: [] },
      executedSteps: 0,
    });
    return;
  }
  try {
    const it = interpret(request);
    for (;;) {
      const next = it.next();
      if (next.done) {
        post({ type: 'done', requestId, ...next.value });
        return;
      }
      post({ type: 'trace', requestId, event: next.value });
    }
  } catch (err) {
    post({
      type: 'done',
      requestId,
      outcome: { status: 'error', message: err instanceof Error ? err.message : String(err) },
      final: { robot: request.world.robot, collected: [], open: [] },
      executedSteps: 0,
    });
  }
}
