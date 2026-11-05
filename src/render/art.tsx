/**
 * Temporary top-down vector art in the concept sketch's flat style. Every
 * piece is drawn with the tile centre at (0, 0), seen from directly above.
 * Final AI-generated art replaces these in build step 5.
 */
import type { CSSProperties, ReactNode } from 'react';
import { LIP, TILE } from './grid';
import type { Theme } from './themes';

const H = TILE / 2;

/** An absolutely positioned SVG whose (0, 0) sits on a screen point. */
export function Anchored(props: {
  x: number;
  y: number;
  size: number;
  z: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
  children: ReactNode;
}) {
  const { x, y, size, z, className, style, label, children } = props;
  return (
    <div
      className={`anchored ${className ?? ''}`}
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, zIndex: z, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} overflow="visible">
        {children}
      </svg>
    </div>
  );
}

export function FloorTile({ theme, x, y }: { theme: Theme; x: number; y: number }) {
  const top = theme.floor.tops[Math.abs(x * 7 + y * 13) % theme.floor.tops.length]!;
  const seed = Math.abs(x * 31 + y * 17);
  return (
    <g>
      <rect x={-H} y={-H} width={TILE} height={TILE} fill={top} stroke={theme.floor.line} strokeWidth={1.5} />
      <circle cx={-22 + (seed % 9) * 3} cy={-18 + (seed % 5) * 6} r={2.5} fill={theme.floor.detail} />
      <circle cx={14 - (seed % 7) * 2} cy={20 - (seed % 4) * 5} r={2} fill={theme.floor.detail} />
    </g>
  );
}

/** The island's earthy front edge, under a tile with nothing below it. */
export function Lip({ theme }: { theme: Theme }) {
  return (
    <g>
      <rect x={-H} y={H} width={TILE} height={LIP} fill={theme.floor.lip} />
      <rect x={-H} y={H + LIP - 4} width={TILE} height={4} fill={theme.floor.lipShade} />
    </g>
  );
}

export function Water({ theme }: { theme: Theme }) {
  return (
    <g>
      <rect x={-H} y={-H} width={TILE} height={TILE} fill={theme.gap.water} />
      <path d="M-26 -10q8 -6 16 0t16 0M-4 16q8 -6 16 0t16 0" fill="none" stroke={theme.gap.ripple} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

export function Rock({ theme }: { theme: Theme }) {
  return (
    <g>
      <rect x={-36} y={-34} width={76} height={76} rx={18} fill={theme.shadow} />
      <rect x={-40} y={-40} width={76} height={76} rx={18} fill={theme.rock.top} stroke={theme.rock.edge} strokeWidth={3} />
      <path d="M-34 -18q4 -18 24 -18q14 0 16 8q-10 2 -16 10q-12 4 -24 0z" fill={theme.rock.moss} />
      <path d="M8 10l10 6l4 12M-12 18l6 -6" fill="none" stroke={theme.rock.edge} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

export function Tree({ theme }: { theme: Theme }) {
  return (
    <g>
      <circle cx={5} cy={7} r={38} fill={theme.shadow} />
      <circle cx={0} cy={0} r={38} fill={theme.tree.canopyShade} />
      <circle cx={-4} cy={-4} r={32} fill={theme.tree.canopy} />
      <circle cx={-14} cy={-14} r={13} fill={theme.tree.canopyLight} />
      <circle cx={14} cy={8} r={7} fill={theme.tree.canopyLight} opacity={0.7} />
    </g>
  );
}

export function GoalFlag({ theme }: { theme: Theme }) {
  // A ring on the ground marks the goal tile, and the flag stands in the
  // top-right corner, so both stay visible when the robot is on the tile.
  return (
    <g>
      <circle cx={0} cy={0} r={38} fill={theme.goal.flag} fillOpacity={0.22} stroke={theme.goal.flag} strokeWidth={4} strokeDasharray="10 7" />
      <ellipse cx={24} cy={-4} rx={9} ry={4} fill={theme.goal.tuft} />
      <rect x={21.5} y={-44} width={5} height={40} rx={2.5} fill={theme.goal.pole} />
      <circle cx={24} cy={-45} r={3.5} fill={theme.goal.pole} />
      <g className="flag-cloth">
        <polygon points="26.5,-44 47,-36 26.5,-28" fill={theme.goal.flag} stroke="#d9a816" strokeWidth={1.5} strokeLinejoin="round" />
      </g>
    </g>
  );
}

export function Collectible({ theme }: { theme: Theme }) {
  return (
    <g className="collectible-gem">
      <ellipse cx={2} cy={14} rx={12} ry={5} fill="rgba(0,0,0,0.12)" />
      <polygon points="0,-16 13,-2 0,14 -13,-2" fill={theme.collectible.fill} />
      <polygon points="0,-16 5,-2 0,14 -4,-2" fill={theme.collectible.shine} opacity={0.6} />
    </g>
  );
}

/** The robot's drawing box. Larger than a tile so the headlamp beam fits. */
export const ROBOT_BOX = 120;

/**
 * Temporary robot, seen from above and pointing up. The controller rotates
 * the whole element; the root's data-mood swaps the eyes.
 */
export function Robot() {
  return (
    <g>
      <circle cx={3} cy={5} r={31} fill="rgba(20,40,60,0.2)" />
      <g className="robot-body">
        <polygon points="-9,-31 9,-31 18,-52 -18,-52" fill="rgba(255, 226, 120, 0.45)" />
        <rect x={-39} y={-10} width={10} height={24} rx={5} fill="#2b78b5" />
        <rect x={29} y={-10} width={10} height={24} rx={5} fill="#2b78b5" />
        <circle cx={0} cy={0} r={29} fill="#3291d6" stroke="#2b78b5" strokeWidth={3} />
        <ellipse cx={0} cy={-27} rx={10} ry={5.5} fill="#f2c230" stroke="#d9a816" strokeWidth={1.5} />
        <circle cx={0} cy={0} r={18} fill="#d6eefc" stroke="#2b78b5" strokeWidth={2} />
        <g className="eyes eyes-idle">
          <circle cx={-6.5} cy={-6} r={3.8} fill="#1d3557" />
          <circle cx={6.5} cy={-6} r={3.8} fill="#1d3557" />
          <circle cx={-5.5} cy={-7.5} r={1.2} fill="#fff" />
          <circle cx={7.5} cy={-7.5} r={1.2} fill="#fff" />
        </g>
        <g className="eyes eyes-happy" fill="none" stroke="#1d3557" strokeWidth={2.6} strokeLinecap="round">
          <path d="M-10 -5q3.5 -5 7 0M3 -5q3.5 -5 7 0" />
        </g>
        <g className="eyes eyes-error" fill="none" stroke="#1d3557" strokeWidth={2.6} strokeLinecap="round">
          <path d="M-10 -9l6 5M-10 -4l6 -5M4 -9l6 5M4 -4l6 -5" />
        </g>
        <circle cx={0} cy={8} r={4} fill="#f2c230" />
      </g>
    </g>
  );
}

/** Arrow pointing up, drawn on the tile ahead and rotated to the facing. */
export const ARROW_POINTS = '0,-26 22,-3 9,-3 9,22 -9,22 -9,-3 -22,-3';
