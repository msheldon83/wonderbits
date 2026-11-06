import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Settings } from '../progress/types';
import type { MotionSettings } from '../render/controller';
import { createWorkerRuntime } from '../runtime/client';
import type { Runtime } from '../runtime/contract';
import { parseRoute, type Route } from './levels';

/** One runtime per mounted app, disposed with it. */
export function useRuntime(): Runtime | null {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  useEffect(() => {
    const r = createWorkerRuntime();
    setRuntime(r);
    return () => r.dispose();
  }, []);
  return runtime;
}

/** Follows the operating system's reduced-motion setting unless the settings override it. */
export function useMotion(speed = 1, override: Settings['reducedMotion'] = 'system'): MotionSettings {
  const query = '(prefers-reduced-motion: reduce)';
  const [system, setSystem] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const reduced = override === 'system' ? system : override === 'on';
  const [motion, setMotion] = useState<MotionSettings>({ reducedMotion: reduced, speed });
  useEffect(() => setMotion({ reducedMotion: reduced, speed }), [reduced, speed]);
  return motion;
}

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/** The current hash route. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => '');
  return parseRoute(hash);
}
