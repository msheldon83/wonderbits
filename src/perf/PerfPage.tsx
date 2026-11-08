/**
 * Performance check from build step 2: a 10 by 10 board with three robots
 * patrolling forever, plus a frame-time meter. Open with ?perf on the device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotion } from '../app/hooks';
import { Board } from '../render/Board';
import type { BoardController } from '../render/controller';
import { forest } from '../render/themes';
import type { TraceEvent } from '../runtime/contract';
import type { Facing, SimState, TileKind, WorldDefinition } from '../sim/types';
import { step } from '../sim/world';

const ROWS = ['..........', '..#....#..', '..........', '....##....', '.#........', '........#.', '...#......', '..........', '.......#..', '..........'];

function perfWorld(): WorldDefinition {
  const tiles: TileKind[][] = ROWS.map((r) => [...r].map((c) => (c === '#' ? 'wall' : 'floor')));
  return { width: 10, height: 10, tiles, robot: { x: 0, y: 0, facing: 'E' }, goal: { x: 9, y: 9 }, collectibles: [] };
}

const STARTS: { x: number; y: number; facing: Facing }[] = [
  { x: 0, y: 0, facing: 'E' },
  { x: 9, y: 2, facing: 'S' },
  { x: 4, y: 9, facing: 'W' },
];

interface Stats {
  fps: number;
  p95: number;
  worst: number;
  slow: number;
}

function useFrameStats(): Stats {
  const [stats, setStats] = useState<Stats>({ fps: 0, p95: 0, worst: 0, slow: 0 });
  useEffect(() => {
    const frames: { t: number; dt: number }[] = [];
    let last = performance.now();
    let raf = 0;
    let lastReport = last;
    const loop = (t: number) => {
      frames.push({ t, dt: t - last });
      last = t;
      while (frames.length && frames[0]!.t < t - 5000) frames.shift();
      if (t - lastReport > 500 && frames.length > 10) {
        lastReport = t;
        const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
        const span = (frames.at(-1)!.t - frames[0]!.t) / 1000;
        setStats({
          fps: Math.round(frames.length / span),
          p95: Math.round(dts[Math.floor(dts.length * 0.95)]! * 10) / 10,
          worst: Math.round(dts.at(-1)! * 10) / 10,
          slow: dts.filter((d) => d > 33.4).length,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return stats;
}

export function PerfPage() {
  const world = useMemo(perfWorld, []);
  const motion = useMotion(1);
  const stats = useFrameStats();
  const [controllers, setControllers] = useState<BoardController[] | null>(null);
  const onControllers = useCallback((cs: BoardController[] | null) => setControllers(cs), []);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!controllers) return;
    const ac = new AbortController();
    abort.current = ac;
    controllers.forEach(async (c, i) => {
      let state: SimState = { robot: { ...STARTS[i]! }, collected: [], open: [] };
      c.showState(state);
      let index = 0;
      while (!ac.signal.aborted) {
        let r = step(world, state, 'forward');
        let op: TraceEvent['op'] = 'forward';
        if (r.kind !== 'ok' || (index + i) % 7 === 6) {
          op = (index + i) % 2 ? 'rotateCW' : 'rotateCCW';
          r = step(world, state, op);
        }
        const event: TraceEvent = {
          index: index++,
          nodeId: `perf${i}`,
          op,
          before: state,
          after: r.state,
          result: r.kind === 'ok' ? { kind: 'ok' } : { kind: 'blocked', reason: r.reason, at: r.at },
        };
        await c.playEvent(event, ac.signal);
        state = r.state;
      }
    });
    return () => ac.abort();
  }, [controllers, world]);

  return (
    <div className="perf">
      <div className="perf-board">
        <Board world={world} theme={forest} motion={motion} label="Performance test board" onControllers={onControllers} robotCount={3} maxScale={1} />
      </div>
      <dl className="perf-stats" aria-live="off">
        <div><dt>Frames per second</dt><dd>{stats.fps}</dd></div>
        <div><dt>95th percentile frame</dt><dd>{stats.p95} ms</dd></div>
        <div><dt>Worst frame, last 5 s</dt><dd>{stats.worst} ms</dd></div>
        <div><dt>Frames over 33 ms</dt><dd>{stats.slow}</dd></div>
        <div><dt>Device pixel ratio</dt><dd>{window.devicePixelRatio}</dd></div>
      </dl>
      <p className="perf-note">Pass: about 60 frames per second and few frames over 33 ms on a real iPad. <a href="./">Back to the puzzle</a></p>
    </div>
  );
}
