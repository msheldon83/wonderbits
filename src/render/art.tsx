/**
 * Temporary vector art in the concept sketch's flat style. Every piece is
 * drawn with the tile centre at (0, 0) so it can be anchored to a cell.
 * Final AI-generated art replaces these in build step 5.
 */
import type { CSSProperties, ReactNode, Ref } from 'react';
import { SIDE, TILE_H, TILE_W } from './iso';
import type { Theme } from './themes';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');

type Point = [number, number];
export const diamond = (scale = 1, lift = 0): [Point, Point, Point, Point] => [
  [0, -HH * scale - lift],
  [HW * scale, -lift],
  [0, HH * scale - lift],
  [-HW * scale, -lift],
];

/** An absolutely positioned SVG whose (0, 0) sits on a screen point. */
export function Anchored(props: {
  x: number;
  y: number;
  w: number;
  above: number;
  below: number;
  z: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
  children: ReactNode;
  dataCell?: string;
}) {
  const { x, y, w, above, below, z, className, style, label, children, dataCell } = props;
  const h = above + below;
  return (
    <div
      className={`anchored ${className ?? ''}`}
      data-cell={dataCell}
      style={{ left: x - w / 2, top: y - above, width: w, height: h, zIndex: z, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={w} height={h} viewBox={`${-w / 2} ${-above} ${w} ${h}`} overflow="visible">
        {children}
      </svg>
    </div>
  );
}

export function FloorTile({ theme, x, y, showLeft, showRight }: { theme: Theme; x: number; y: number; showLeft: boolean; showRight: boolean }) {
  const top = theme.floor.tops[Math.abs(x * 7 + y * 13) % theme.floor.tops.length]!;
  return (
    <g>
      {showLeft && <polygon points={pts([[-HW, 0], [0, HH], [0, HH + SIDE], [-HW, SIDE]])} fill={theme.floor.left} />}
      {showRight && <polygon points={pts([[0, HH], [HW, 0], [HW, SIDE], [0, HH + SIDE]])} fill={theme.floor.right} />}
      <polygon points={pts(diamond())} fill={top} stroke={theme.floor.line} strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );
}

export function Rock({ theme }: { theme: Theme }) {
  const lift = 40;
  const s = 0.86;
  const [t, r, b, l] = diamond(s);
  const up = (p: [number, number]): [number, number] => [p[0], p[1] - lift];
  return (
    <g>
      <polygon points={pts([l, b, up(b), up(l)])} fill={theme.rock.left} />
      <polygon points={pts([b, r, up(r), up(b)])} fill={theme.rock.right} />
      <polygon points={pts([up(t), up(r), up(b), up(l)])} fill={theme.rock.top} />
      <polygon points={pts([up(t), [up(r)[0] * 0.55, up(r)[1] - 6], up(b), [up(l)[0] * 0.6, up(l)[1] + 4]])} fill={theme.rock.moss} opacity={0.85} />
    </g>
  );
}

export function Tree({ theme }: { theme: Theme }) {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={30} ry={13} fill={theme.tree.base} opacity={0.9} />
      <rect x={-5} y={-34} width={10} height={40} rx={3} fill={theme.tree.trunk} />
      <circle cx={-15} cy={-50} r={22} fill={theme.tree.canopyShade} />
      <circle cx={15} cy={-52} r={22} fill={theme.tree.canopy} />
      <circle cx={0} cy={-70} r={26} fill={theme.tree.canopy} />
      <circle cx={-8} cy={-78} r={9} fill="#ffffff" opacity={0.18} />
    </g>
  );
}

export function GoalFlag({ theme }: { theme: Theme }) {
  // Planted at the back-right of its tile and tall enough to clear the
  // robot's head, so the flag stays readable when the robot stands on it.
  const px = 30;
  const py = -8;
  return (
    <g>
      <ellipse cx={px} cy={py + 2} rx={16} ry={7} fill={theme.goal.tuft} />
      <rect x={px - 2} y={py - 108} width={4} height={110} rx={2} fill={theme.goal.pole} />
      <circle cx={px} cy={py - 110} r={4} fill={theme.goal.pole} />
      <g className="flag-cloth">
        <polygon points={pts([[px + 2, py - 106], [px + 44, py - 93], [px + 2, py - 80]])} fill={theme.goal.flag} />
      </g>
    </g>
  );
}

export function Collectible({ theme }: { theme: Theme }) {
  return (
    <g className="collectible-gem">
      <ellipse cx={0} cy={6} rx={12} ry={5} fill="rgba(0,0,0,0.12)" />
      <polygon points={pts([[0, -34], [12, -20], [0, -4], [-12, -20]])} fill={theme.collectible.fill} />
      <polygon points={pts([[0, -34], [5, -20], [0, -4], [-4, -20]])} fill={theme.collectible.shine} opacity={0.6} />
    </g>
  );
}

/** Size of the robot's drawing box, shared with the controller. */
export const ROBOT_BOX = { w: 96, above: 124, below: 16 } as const;

/**
 * Temporary robot. The controller flips `.robot-flip` for left-facing
 * directions and swaps front and back views via the root's data-facing.
 */
export function Robot({ flipRef }: { flipRef?: Ref<SVGGElement> }) {
  return (
    <g>
      <ellipse cx={0} cy={4} rx={22} ry={9} fill="rgba(20,40,60,0.22)" />
      <g className="robot-flip" ref={flipRef}>
        <g className="robot-body">
          <rect x={-26} y={-44} width={10} height={22} rx={5} fill="#2b78b5" />
          <rect x={16} y={-44} width={10} height={22} rx={5} fill="#2b78b5" />
          <rect x={-19} y={-52} width={38} height={44} rx={13} fill="#3291d6" />
          <rect x={-19} y={-14} width={38} height={8} rx={4} fill="#2b78b5" />
          <g className="robot-front">
            <rect x={-10} y={-40} width={20} height={16} rx={5} fill="#a9d8f7" />
            <circle cx={-3} cy={-32} r={2.4} fill="#f2c230" />
            <circle cx={4} cy={-32} r={2.4} fill="#7fd18b" />
          </g>
          <g className="robot-back">
            <rect x={-11} y={-42} width={22} height={22} rx={6} fill="#2b78b5" />
            <circle cx={-4} cy={-31} r={2.2} fill="#a9d8f7" />
            <circle cx={4} cy={-31} r={2.2} fill="#a9d8f7" />
          </g>
          <ellipse cx={0} cy={-62} rx={21} ry={17} fill="#d6eefc" stroke="#2b78b5" strokeWidth={3} />
          <g className="robot-front">
            <circle cx={7} cy={-63} r={7.5} fill="#ffffff" stroke="#1d3557" strokeWidth={1.5} />
            <circle cx={9.5} cy={-63} r={3.8} fill="#1d3557" />
            <circle cx={11} cy={-65} r={1.3} fill="#ffffff" />
          </g>
          <line x1={0} y1={-79} x2={0} y2={-91} stroke="#2b78b5" strokeWidth={3} strokeLinecap="round" />
          <circle cx={0} cy={-94} r={5} fill="#f2c230" />
        </g>
      </g>
    </g>
  );
}

/** Arrow on the tile ahead, drawn flat on the ground plane. */
export const INDICATOR_BOX = { w: TILE_W, above: HH + 4, below: HH + 4 } as const;
