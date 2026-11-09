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

export function GoalFlag({ theme, ring = true }: { theme: Theme; ring?: boolean }) {
  // A ring on the ground marks the goal tile, and the flag stands in the
  // top-right corner, so both stay visible when the robot is on the tile.
  // The prediction marker draws its own ring, so it asks for none here.
  return (
    <g>
      {ring && <circle cx={0} cy={0} r={38} fill={theme.goal.flag} fillOpacity={0.22} stroke={theme.goal.flag} strokeWidth={4} strokeDasharray="10 7" />}
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

/**
 * A gate across the tile: two posts and a lettered sign in the gate's
 * colour, with bars that slide into the posts when it opens. The open look
 * comes from CSS on the wrapper's data-open, so the controller only flips
 * an attribute.
 */
export function GateArt({ color, letter, code }: { color: string; letter: string; code?: number }) {
  return (
    <g className="gate-art">
      <g className="gate-bars">
        <rect x={-38} y={-14} width={76} height={9} rx={4} fill={color} />
        <rect x={-38} y={4} width={76} height={9} rx={4} fill={color} />
        <path d="M-30 -14 L-14 13 M-6 -14 L10 13 M18 -14 L32 9" stroke="rgba(0,0,0,0.18)" strokeWidth={4} strokeLinecap="round" />
      </g>
      <rect x={-46} y={-24} width={12} height={46} rx={5} fill="#7a5b40" />
      <rect x={34} y={-24} width={12} height={46} rx={5} fill="#7a5b40" />
      <circle cx={0} cy={-34} r={13} fill="#fff" stroke={color} strokeWidth={4} />
      <text x={0} y={-29} textAnchor="middle" fontSize={16} fontWeight={800} fill={color} fontFamily="inherit">
        {letter}
      </text>
      {code !== undefined && (
        // A number lock hangs on the bars: the code that opens it.
        <g className="gate-lock">
          <rect x={-14} y={-10} width={28} height={22} rx={5} fill="#3b3f4a" />
          <text x={0} y={7} textAnchor="middle" fontSize={16} fontWeight={800} fill="#fff" fontFamily="inherit">
            {code}
          </text>
        </g>
      )}
    </g>
  );
}

/** A switch plate on the floor, ringed in the colour of the gate it flips, with the gate's letter on it. */
export function SwitchArt({ color, letter }: { color: string; letter: string }) {
  return (
    <g className="switch-art">
      <rect x={-30} y={-30} width={60} height={60} rx={14} fill="#eef3ef" stroke={color} strokeWidth={6} />
      <circle className="switch-button" cx={0} cy={0} r={17} fill={color} />
      <text x={0} y={6} textAnchor="middle" fontSize={17} fontWeight={800} fill="#fff" fontFamily="inherit">
        {letter}
      </text>
    </g>
  );
}

/** A pressure plate: a round stone pad with its number. It does nothing until a When card says so. */
export function PlateArt({ label }: { label: string }) {
  return (
    <g className="plate-art">
      <circle cx={0} cy={0} r={31} fill="#d9d2c3" stroke="#a89c86" strokeWidth={5} />
      <circle cx={0} cy={0} r={21} fill="#eee8dc" />
      <text x={0} y={7} textAnchor="middle" fontSize={20} fontWeight={800} fill="#6f6250" fontFamily="inherit">
        {label}
      </text>
    </g>
  );
}

/** A floating log, seen from above, that carries the robot across water. */
export function LogArt() {
  return (
    <g className="log-art">
      <rect x={-44} y={-26} width={88} height={52} rx={22} fill="#9a6a3f" stroke="#6f4a29" strokeWidth={4} />
      <path d="M-30 -10 H22 M-24 8 H30" stroke="#6f4a29" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      <ellipse cx={36} cy={0} rx={8} ry={18} fill="#c79a66" stroke="#6f4a29" strokeWidth={3} />
    </g>
  );
}

/** A beetle on patrol, seen from above. Touching it stops the robot. */
export function BeetleArt() {
  return (
    <g className="beetle-art">
      <path d="M-22 -14 L-34 -22 M-24 0 L-38 0 M-22 14 L-34 22 M22 -14 L34 -22 M24 0 L38 0 M22 14 L34 22" stroke="#2b2b35" strokeWidth={4} strokeLinecap="round" />
      <ellipse cx={0} cy={4} rx={24} ry={28} fill="#3d3f73" />
      <path d="M0 -22 V32" stroke="#23244a" strokeWidth={3} />
      <circle cx={0} cy={-26} r={11} fill="#23244a" />
      <circle cx={-9} cy={6} r={5} fill="#8f92d6" />
      <circle cx={9} cy={14} r={4} fill="#8f92d6" />
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

/**
 * Ghost of the robot on the tile ahead: where Forward will land, facing the
 * same way. Drawn pointing up; the indicator element is rotated to the facing.
 */
export function GhostRobot() {
  return (
    <g className="ghost-robot">
      <circle cx={0} cy={0} r={30} fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.95)" strokeWidth={4} strokeDasharray="9 7" />
      <ellipse cx={0} cy={-27} rx={9} ry={5} fill="rgba(242, 194, 48, 0.85)" />
      <circle cx={0} cy={0} r={16} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2.5} />
    </g>
  );
}

/** The turn cue's drawing box, centred on the robot. */
export const CUE_BOX = 128;

/**
 * Curved arrow over the top of the robot, sweeping clockwise and ending in
 * an arrowhead that points down the right side. Mirror it for counter-clockwise.
 * Shared by the board cue and the command card icons so they match.
 */
export function TurnArrow({ r, stroke, color = 'currentColor' }: { r: number; stroke: number; color?: string }) {
  const head = stroke * 2.4;
  return (
    <g fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`} />
      <path d={`M ${r - head} ${-head * 0.35} L ${r} ${head} L ${r + head} ${-head * 0.35}`} />
    </g>
  );
}

/** Both turn directions; CSS shows the one the controller asks for. */
export function TurnCue() {
  const color = 'rgba(255, 255, 255, 0.95)';
  return (
    <g className="turn-cue-art">
      <g className="turn-cw">
        <TurnArrow r={50} stroke={9} color="rgba(29, 48, 71, 0.28)" />
        <TurnArrow r={50} stroke={6} color={color} />
      </g>
      <g className="turn-ccw" transform="scale(-1 1)">
        <TurnArrow r={50} stroke={9} color="rgba(29, 48, 71, 0.28)" />
        <TurnArrow r={50} stroke={6} color={color} />
      </g>
    </g>
  );
}
