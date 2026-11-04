import { useEffect, useState } from 'react';
import { createWorkerRuntime } from '../runtime/client';
import type { Runtime } from '../runtime/contract';
import type { MotionSettings } from '../render/controller';

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

/** Follows the operating system's reduced-motion setting. */
export function useMotion(speed = 1): MotionSettings {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [motion, setMotion] = useState<MotionSettings>({ reducedMotion: reduced, speed });
  useEffect(() => setMotion({ reducedMotion: reduced, speed }), [reduced, speed]);
  return motion;
}
