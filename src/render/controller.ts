/**
 * Imperative board controller. React renders the board once; this class owns
 * the robot's transform, z-order and facing, and animates trace events with
 * the Web Animations API. Keeping animation out of React state avoids
 * re-render fights mid-tween.
 */
import type { TraceEvent } from '../runtime/contract';
import type { Facing, RobotState, SimState, WorldDefinition } from '../sim/types';
import { ahead, cellKey, tileAt } from '../sim/world';
import { ROBOT_BOX } from './art';
import { depth, FACES_SCREEN_RIGHT, FACES_VIEWER, LAYER, orient, projectOffset, toScreen, type BoardLayout } from './iso';
import type { Player } from './sequencer';

export interface MotionSettings {
  reducedMotion: boolean;
  /** Playback speed multiplier; 1 is normal. */
  speed: number;
}

export interface RobotElements {
  root: HTMLElement;
  flip: SVGGElement;
  indicator: HTMLElement;
  arrow: SVGPolygonElement;
}

const MOVE_MS = 440;
const TURN_MS = 360;
const BUMP_MS = 420;
const REDUCED_PAUSE_MS = 280;

function settle(anim: Animation, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      anim.cancel();
      return resolve();
    }
    const onAbort = () => {
      anim.cancel();
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    anim.finished.then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      () => resolve(), // cancelled
    );
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });
}

/** Arrow pointing east in grid space, in tile units, centred on the tile. */
const ARROW: [number, number][] = [
  [-0.3, -0.11], [0.02, -0.11], [0.02, -0.24], [0.3, 0], [0.02, 0.24], [0.02, 0.11], [-0.3, 0.11],
];

export class BoardController implements Player {
  constructor(
    private world: WorldDefinition,
    private layout: BoardLayout,
    private robot: RobotElements,
    private collectibles: Map<string, HTMLElement>,
    private colors: { ok: string; blocked: string },
    public motion: MotionSettings,
  ) {}

  private transformFor(robot: Pick<RobotState, 'x' | 'y'>, lift = 0, squash = 1): string {
    const p = toScreen(this.layout, robot);
    const base = `translate(${p.x - ROBOT_BOX.w / 2}px, ${p.y - ROBOT_BOX.above - lift}px)`;
    return squash === 1 ? base : `${base} scaleX(${squash})`;
  }

  private setFacing(facing: Facing): void {
    this.robot.root.dataset.facing = facing;
    this.robot.root.dataset.view = FACES_VIEWER[facing] ? 'front' : 'back';
    if (FACES_SCREEN_RIGHT[facing]) this.robot.flip.removeAttribute('transform');
    else this.robot.flip.setAttribute('transform', 'scale(-1, 1)');
  }

  private place(robot: RobotState): void {
    const el = this.robot.root;
    el.style.transform = this.transformFor(robot);
    el.style.zIndex = String(depth(robot, LAYER.robot));
    this.setFacing(robot.facing);
  }

  private showIndicator(robot: RobotState | null): void {
    const ind = this.robot.indicator;
    if (!robot) {
      ind.style.opacity = '0';
      return;
    }
    const target = ahead(robot, robot.facing);
    const blocked = tileAt(this.world, target) !== 'floor';
    const p = toScreen(this.layout, target);
    ind.style.transform = `translate(${p.x - ind.offsetWidth / 2}px, ${p.y - ind.offsetHeight / 2}px)`;
    ind.style.zIndex = String(depth(target, LAYER.indicator));
    ind.style.opacity = '1';
    ind.dataset.blocked = String(blocked);
    this.robot.arrow.setAttribute(
      'points',
      ARROW.map(([gx, gy]) => projectOffset(...orient(robot.facing, gx, gy)).join(',')).join(' '),
    );
    this.robot.arrow.setAttribute('fill', blocked ? this.colors.blocked : this.colors.ok);
  }

  showState(state: SimState): void {
    this.robot.root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.place(state.robot);
    for (const [key, el] of this.collectibles) {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = state.collected.includes(key) ? '0' : '1';
    }
    this.robot.root.dataset.mood = 'idle';
    this.showIndicator(state.robot);
  }

  async playEvent(event: TraceEvent, signal: AbortSignal): Promise<void> {
    const { before, after, result } = event;
    const ms = (n: number) => n / this.motion.speed;
    this.showIndicator(null);

    if (this.motion.reducedMotion) {
      this.place(after.robot);
      if (result.kind === 'blocked') this.robot.root.dataset.mood = 'error';
      if (result.kind === 'ok' && result.collected) this.collectibles.get(cellKey(result.collected))!.style.opacity = '0';
      await wait(ms(REDUCED_PAUSE_MS), signal);
      if (!signal.aborted) this.showIndicator(after.robot);
      return;
    }

    const el = this.robot.root;
    if (event.op === 'forward' && result.kind === 'ok') {
      const nearer = depth(after.robot, 0) > depth(before.robot, 0);
      if (nearer) el.style.zIndex = String(depth(after.robot, LAYER.robot));
      const mid = { x: (before.robot.x + after.robot.x) / 2, y: (before.robot.y + after.robot.y) / 2 };
      const anim = el.animate(
        [
          { transform: this.transformFor(before.robot) },
          { transform: this.transformFor(mid, 8), offset: 0.5 },
          { transform: this.transformFor(after.robot) },
        ],
        { duration: ms(MOVE_MS), easing: 'ease-in-out', fill: 'forwards' },
      );
      await settle(anim, signal);
      if (signal.aborted) return;
      this.place(after.robot);
      anim.cancel();
      if (result.collected) {
        const gem = this.collectibles.get(cellKey(result.collected))!;
        const pop = gem.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -24px' }], {
          duration: ms(300),
          fill: 'forwards',
        });
        await settle(pop, signal);
        gem.style.opacity = '0';
      }
    } else if (event.op === 'forward' && result.kind === 'blocked') {
      const nudge = {
        x: before.robot.x + (result.at.x - before.robot.x) * 0.22,
        y: before.robot.y + (result.at.y - before.robot.y) * 0.22,
      };
      el.dataset.mood = 'error';
      const anim = el.animate(
        [
          { transform: this.transformFor(before.robot) },
          { transform: this.transformFor(nudge), offset: 0.35 },
          { transform: this.transformFor(before.robot), offset: 0.6 },
          { transform: `${this.transformFor(before.robot)} rotate(-4deg)`, offset: 0.75 },
          { transform: `${this.transformFor(before.robot)} rotate(4deg)`, offset: 0.9 },
          { transform: this.transformFor(before.robot) },
        ],
        { duration: ms(BUMP_MS), easing: 'ease-out' },
      );
      await settle(anim, signal);
      if (signal.aborted) return;
    } else {
      // Rotation: squash, swap facing at the midpoint, expand.
      const half = { duration: ms(TURN_MS / 2), easing: 'ease-in', fill: 'forwards' as const };
      const a = el.animate([{ transform: this.transformFor(before.robot) }, { transform: this.transformFor(before.robot, 4, 0.15) }], half);
      await settle(a, signal);
      if (signal.aborted) return;
      this.setFacing(after.robot.facing);
      const b = el.animate([{ transform: this.transformFor(after.robot, 4, 0.15) }, { transform: this.transformFor(after.robot) }], {
        ...half,
        easing: 'ease-out',
      });
      a.cancel();
      await settle(b, signal);
      if (signal.aborted) return;
      this.place(after.robot);
      b.cancel();
    }
    this.showIndicator(after.robot);
  }

  async celebrate(signal: AbortSignal): Promise<void> {
    this.robot.root.dataset.mood = 'happy';
    if (this.motion.reducedMotion) return;
    const el = this.robot.root;
    const base = el.style.transform;
    const anim = el.animate(
      [
        { transform: base },
        { transform: `${base} translateY(-22px)`, offset: 0.25 },
        { transform: base, offset: 0.5 },
        { transform: `${base} translateY(-14px)`, offset: 0.72 },
        { transform: base },
      ],
      { duration: 760 / this.motion.speed, easing: 'ease-in-out' },
    );
    await settle(anim, signal);
  }
}
