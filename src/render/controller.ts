/**
 * Imperative board controller. React renders the board once; this class owns
 * the robot's transform and animates trace events with the Web Animations API.
 * Keeping animation out of React state avoids re-render fights mid-tween.
 *
 * Top-down: the robot sprite points up and is rotated to its facing. Display
 * angles accumulate across turns so every turn animates exactly 90 degrees.
 */
import { functionLabel } from '../ir/types';
import type { TraceEvent } from '../runtime/contract';
import type { Cell, RobotState, SimState, WorldDefinition } from '../sim/types';
import { ahead, cellKey, tileAt } from '../sim/world';
import { CUE_BOX, ROBOT_BOX } from './art';
import { angleFor, toScreen, TILE, turnAngle, type BoardLayout } from './grid';
import type { Player } from './sequencer';

export interface MotionSettings {
  reducedMotion: boolean;
  /** Playback speed multiplier; 1 is normal. */
  speed: number;
}

export interface RobotElements {
  root: HTMLElement;
  /** Ghost and arrow on the tile ahead. */
  indicator: HTMLElement;
  arrow: SVGPolygonElement;
  /** Curved arrow around the robot, shown while it turns. */
  turnCue: HTMLElement;
  /** Speech bubble over the robot: the answer to a check, or which go round a Repeat is on. */
  bubble: HTMLElement;
}

const MOVE_MS = 420;
const TURN_MS = 380;
/** The turn cue lingers a little after the robot has settled. */
const CUE_TAIL_MS = 140;
const BUMP_MS = 440;
/** A check or a loop turn pauses this long with its bubble showing. */
const THINK_MS = 520;
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

export class BoardController implements Player {
  /** Current display angle in degrees; may run past 360 or below 0. */
  private angle = 0;
  /** The cell the robot was last placed on. */
  private cell: Cell = { x: 0, y: 0 };
  private lastRobot: RobotState | null = null;
  /** False while the child is predicting: the next-tile ghost would give the answer away. */
  private indicatorVisible = true;

  constructor(
    private world: WorldDefinition,
    private layout: BoardLayout,
    private robot: RobotElements,
    private collectibles: Map<string, HTMLElement>,
    private colors: { ok: string; blocked: string },
    public motion: MotionSettings,
  ) {}

  private transformFor(cell: Cell, angle: number, scale = 1): string {
    const p = toScreen(this.layout, cell);
    const t = `translate(${p.x - ROBOT_BOX / 2}px, ${p.y - ROBOT_BOX / 2}px) rotate(${angle}deg)`;
    return scale === 1 ? t : `${t} scale(${scale})`;
  }

  private place(robot: RobotState, angle = angleFor(robot.facing)): void {
    this.angle = angle;
    this.cell = { x: robot.x, y: robot.y };
    this.robot.root.style.transform = this.transformFor(robot, angle);
    this.robot.root.dataset.facing = robot.facing;
  }

  private setMood(mood: 'idle' | 'happy' | 'error'): void {
    this.robot.root.dataset.mood = mood;
  }

  setIndicatorVisible(visible: boolean): void {
    this.indicatorVisible = visible;
    this.showIndicator(this.lastRobot);
  }

  private showIndicator(robot: RobotState | null): void {
    const ind = this.robot.indicator;
    this.lastRobot = robot;
    if (!robot || !this.indicatorVisible) {
      ind.style.opacity = '0';
      return;
    }
    const target = ahead(robot, robot.facing);
    const tile = tileAt(this.world, target);
    const blocked = tile !== 'floor';
    // Off the island there is no tile to draw on, so a smaller arrow sits on
    // the board's edge instead of being clipped by the viewport.
    const offBoard = tile === 'outside';
    const at = offBoard ? { x: (robot.x + target.x) / 2, y: (robot.y + target.y) / 2 } : target;
    const p = toScreen(this.layout, at);
    ind.style.transform =
      `translate(${p.x - TILE / 2}px, ${p.y - TILE / 2}px) rotate(${angleFor(robot.facing)}deg)` + (offBoard ? ' scale(0.6)' : '');
    ind.style.opacity = '1';
    ind.dataset.blocked = String(blocked);
    // A clear move shows a ghost of the robot with a small arrow inside it; a
    // blocked move shows only the big red arrow.
    this.robot.arrow.setAttribute('fill', blocked ? this.colors.blocked : this.colors.ok);
    this.robot.arrow.setAttribute('transform', blocked ? '' : 'scale(0.45)');
  }

  /** Curved arrow around the robot showing which way it is turning. */
  private showTurnCue(robot: RobotState, op: 'rotateCW' | 'rotateCCW', durationMs: number, signal: AbortSignal): Promise<void> {
    const cue = this.robot.turnCue;
    const p = toScreen(this.layout, robot);
    const base = `translate(${p.x - CUE_BOX / 2}px, ${p.y - CUE_BOX / 2}px)`;
    const sign = op === 'rotateCW' ? 1 : -1;
    cue.dataset.dir = op === 'rotateCW' ? 'cw' : 'ccw';
    if (this.motion.reducedMotion) {
      cue.style.transform = base;
      cue.style.opacity = '1';
      return wait(durationMs, signal).then(() => {
        cue.style.opacity = '0';
      });
    }
    const anim = cue.animate(
      [
        { opacity: 0, transform: `${base} rotate(${-25 * sign}deg) scale(0.9)` },
        { opacity: 1, transform: `${base} rotate(0deg) scale(1)`, offset: 0.25 },
        { opacity: 1, transform: `${base} rotate(${55 * sign}deg) scale(1)`, offset: 0.8 },
        { opacity: 0, transform: `${base} rotate(${80 * sign}deg) scale(1.05)` },
      ],
      { duration: durationMs, easing: 'ease-in-out' },
    );
    return settle(anim, signal);
  }

  /** The bubble over the robot while it thinks: "yes", "no", "2 of 3", or the name of the function it hands over to. */
  private showBubble(robot: RobotState, text: string, tone: 'yes' | 'no' | 'loop' | 'call', durationMs: number, signal: AbortSignal): Promise<void> {
    const bubble = this.robot.bubble;
    const p = toScreen(this.layout, robot);
    bubble.textContent = text;
    bubble.dataset.tone = tone;
    const base = `translate(${p.x}px, ${p.y - TILE * 0.62}px) translate(-50%, -100%)`;
    if (this.motion.reducedMotion) {
      bubble.style.transform = base;
      bubble.style.opacity = '1';
      return wait(durationMs, signal).then(() => {
        bubble.style.opacity = '0';
      });
    }
    const anim = bubble.animate(
      [
        { opacity: 0, transform: `${base} scale(0.6)` },
        { opacity: 1, transform: `${base} scale(1.05)`, offset: 0.25 },
        { opacity: 1, transform: `${base} scale(1)`, offset: 0.8 },
        { opacity: 0, transform: `${base} scale(1)` },
      ],
      { duration: durationMs, easing: 'ease-out' },
    );
    return settle(anim, signal);
  }

  showState(state: SimState): void {
    this.robot.root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.robot.turnCue.getAnimations().forEach((a) => a.cancel());
    this.robot.turnCue.style.opacity = '0';
    this.robot.bubble.getAnimations().forEach((a) => a.cancel());
    this.robot.bubble.style.opacity = '0';
    this.place(state.robot);
    for (const [key, el] of this.collectibles) {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = state.collected.includes(key) ? '0' : '1';
    }
    this.setMood('idle');
    this.showIndicator(state.robot);
  }

  async playEvent(event: TraceEvent, signal: AbortSignal): Promise<void> {
    const { before, after, result } = event;
    const ms = (n: number) => n / this.motion.speed;
    const el = this.robot.root;
    const from = this.angle;
    const to = turnAngle(from, event.op);

    // A block thinking: nothing moves, a bubble says what it decided.
    if (event.op === 'check' || event.op === 'loop' || event.op === 'call') {
      const text = event.op === 'check' ? (event.value ? 'yes' : 'no') : event.op === 'call' ? functionLabel(event.name) : `${event.iteration} of ${event.count}`;
      const tone = event.op === 'loop' ? 'loop' : event.op === 'call' ? 'call' : event.value ? 'yes' : 'no';
      await this.showBubble(before.robot, text, tone, ms(THINK_MS), signal);
      return;
    }
    this.showIndicator(null);

    if (this.motion.reducedMotion) {
      this.place(after.robot, to);
      if (result.kind === 'blocked') this.setMood('error');
      if (result.kind === 'ok' && result.collected) this.collectibles.get(cellKey(result.collected))!.style.opacity = '0';
      if (event.op === 'forward') await wait(ms(REDUCED_PAUSE_MS), signal);
      else await this.showTurnCue(after.robot, event.op, ms(REDUCED_PAUSE_MS * 2), signal);
      if (!signal.aborted) this.showIndicator(after.robot);
      return;
    }

    if (event.op === 'forward' && result.kind === 'ok') {
      const mid = { x: (before.robot.x + after.robot.x) / 2, y: (before.robot.y + after.robot.y) / 2 };
      const anim = el.animate(
        [
          { transform: this.transformFor(before.robot, from) },
          { transform: this.transformFor(mid, from, 1.06), offset: 0.5 },
          { transform: this.transformFor(after.robot, from) },
        ],
        { duration: ms(MOVE_MS), easing: 'ease-in-out', fill: 'forwards' },
      );
      await settle(anim, signal);
      if (signal.aborted) return;
      this.place(after.robot, from);
      anim.cancel();
      if (result.collected) {
        const gem = this.collectibles.get(cellKey(result.collected))!;
        const pop = gem.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '1.6' }], { duration: ms(300), fill: 'forwards' });
        await settle(pop, signal);
        gem.style.opacity = '0';
      }
    } else if (event.op === 'forward' && result.kind === 'blocked') {
      const nudge = {
        x: before.robot.x + (result.at.x - before.robot.x) * 0.22,
        y: before.robot.y + (result.at.y - before.robot.y) * 0.22,
      };
      this.setMood('error');
      const anim = el.animate(
        [
          { transform: this.transformFor(before.robot, from) },
          { transform: this.transformFor(nudge, from), offset: 0.35 },
          { transform: this.transformFor(before.robot, from), offset: 0.6 },
          { transform: this.transformFor(before.robot, from - 7), offset: 0.75 },
          { transform: this.transformFor(before.robot, from + 7), offset: 0.9 },
          { transform: this.transformFor(before.robot, from) },
        ],
        { duration: ms(BUMP_MS), easing: 'ease-out' },
      );
      await settle(anim, signal);
      if (signal.aborted) return;
    } else if (event.op === 'rotateCW' || event.op === 'rotateCCW') {
      // Rotation: a literal 90 degree turn on screen, with a small lift, and a
      // curved arrow sweeping the same way so the direction is unmistakable.
      const anim = el.animate(
        [
          { transform: this.transformFor(before.robot, from) },
          { transform: this.transformFor(before.robot, (from + to) / 2, 1.08), offset: 0.5 },
          { transform: this.transformFor(after.robot, to) },
        ],
        { duration: ms(TURN_MS), easing: 'ease-in-out', fill: 'forwards' },
      );
      const cue = this.showTurnCue(before.robot, event.op, ms(TURN_MS + CUE_TAIL_MS), signal);
      await settle(anim, signal);
      if (signal.aborted) return;
      this.place(after.robot, to);
      anim.cancel();
      await cue;
      if (signal.aborted) return;
    }
    this.showIndicator(after.robot);
  }

  async celebrate(signal: AbortSignal): Promise<void> {
    this.setMood('happy');
    this.showIndicator(null);
    if (this.motion.reducedMotion) return;
    const a = this.angle;
    const anim = this.robot.root.animate(
      [
        { transform: this.transformFor(this.cell, a) },
        { transform: this.transformFor(this.cell, a + 180, 1.18), offset: 0.5 },
        { transform: this.transformFor(this.cell, a + 360) },
      ],
      { duration: 800 / this.motion.speed, easing: 'ease-in-out' },
    );
    await settle(anim, signal);
  }
}
