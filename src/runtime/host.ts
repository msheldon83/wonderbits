/**
 * Runtime host: the code on the far side of the contract. Kept separate from
 * the Worker global so it can be tested over a plain MessageChannel.
 */
import { CONTRACT_VERSION, type LiveInput, type LiveRequest, type RunRequest, type RuntimeMessage } from './contract';
import { interpret, interpretLive } from './interpreter';

export type Post = (message: RuntimeMessage) => void;

export function handleRequest(request: RunRequest, post: Post): void {
  const { requestId } = request;
  if (request.contract !== CONTRACT_VERSION) {
    post({
      type: 'done',
      requestId,
      outcome: { status: 'error', message: `Unsupported contract version ${String(request.contract)}` },
      final: { robot: request.world.robot, collected: [], open: [], tick: 0 },
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
      final: { robot: request.world.robot, collected: [], open: [], tick: 0 },
      executedSteps: 0,
    });
  }
}

/**
 * Live runs: each is an interpreter held where it stopped, waiting for its
 * next input. One host keeps the runs it was asked to start, by id.
 */
export function createLiveHost(): (request: LiveRequest, post: Post) => void {
  const runs = new Map<string, ReturnType<typeof interpretLive>>();
  const blank = (requestId: string, message: string): RuntimeMessage => ({ type: 'done', requestId, outcome: { status: 'error', message }, final: { robot: { x: 0, y: 0, facing: 'N' }, collected: [], open: [], tick: 0 }, executedSteps: 0 });

  /** Resume a run with an input (or nothing, to start it) and post what it does until it waits again or ends. */
  const pump = (requestId: string, it: ReturnType<typeof interpretLive>, post: Post, input?: LiveInput | null): void => {
    try {
      let next = it.next(input);
      for (;;) {
        if (next.done) {
          runs.delete(requestId);
          post({ type: 'done', requestId, ...next.value });
          return;
        }
        if (next.value.op === 'await') {
          post({ type: 'waiting', requestId });
          return;
        }
        post({ type: 'trace', requestId, event: next.value });
        next = it.next();
      }
    } catch (err) {
      runs.delete(requestId);
      post(blank(requestId, err instanceof Error ? err.message : String(err)));
    }
  };

  return (request, post) => {
    const { requestId } = request;
    if (request.type === 'live-start') {
      if (request.contract !== CONTRACT_VERSION) return post(blank(requestId, `Unsupported contract version ${String(request.contract)}`));
      const { program, world, objective, limits, seed, clock } = request;
      const it = interpretLive({ program, world, objective, limits, ...(seed !== undefined && { seed }), live: { clock } });
      runs.set(requestId, it);
      return pump(requestId, it, post);
    }
    const it = runs.get(requestId);
    // An input for a run that has ended, or was never started, is dropped: the run already said it was done.
    if (!it) return;
    pump(requestId, it, post, request.type === 'live-stop' ? null : request.input);
  };
}
