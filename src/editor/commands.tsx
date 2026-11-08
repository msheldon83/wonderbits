import type { ReactElement } from 'react';
import type { CardId, ConditionId, IRNode } from '../ir/types';
import { TurnArrow } from '../render/art';

export interface CommandInfo {
  label: string;
  /** Spoken by screen readers and used in messages. */
  description: string;
  icon: ReactElement;
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** A loop arrow, shared by Repeat and Repeat until. */
const LoopArrow = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <path d="M24.5 13.5A9.5 9.5 0 1 0 25.5 19" {...stroke} />
    <path d="M19.5 8.5h6v6" {...stroke} />
  </svg>
);

export const COMMANDS: Record<CardId, CommandInfo> = {
  forward: {
    label: 'Forward',
    description: 'Move forward one tile',
    icon: (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M16 26V7M8 14l8-8 8 8" {...stroke} />
      </svg>
    ),
  },
  rotateCW: {
    label: 'Rotate',
    description: 'Rotate clockwise',
    icon: (
      <svg viewBox="-16 -16 32 32" width="28" height="28" aria-hidden="true">
        <g transform="translate(0 3)">
          <TurnArrow r={10} stroke={3.2} />
        </g>
      </svg>
    ),
  },
  rotateCCW: {
    label: 'Rotate',
    description: 'Rotate counter-clockwise',
    icon: (
      <svg viewBox="-16 -16 32 32" width="28" height="28" aria-hidden="true">
        <g transform="translate(0 3) scale(-1 1)">
          <TurnArrow r={10} stroke={3.2} />
        </g>
      </svg>
    ),
  },
  repeat: {
    label: 'Repeat',
    description: 'Repeat the cards inside a number of times',
    icon: <LoopArrow />,
  },
  if: {
    label: 'If',
    description: 'Run the cards inside only when the check says yes',
    icon: (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M11 11.5a5 5 0 1 1 7 4.6c-1.4.7-2 1.6-2 3v1" {...stroke} />
        <circle cx="16" cy="25.5" r="1.9" fill="currentColor" />
      </svg>
    ),
  },
  ifElse: {
    label: 'If / else',
    description: 'Run the first cards when the check says yes, otherwise the else cards',
    icon: (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M16 27V16M16 16l-8-6M16 16l8-6" {...stroke} />
        <circle cx="8" cy="8" r="3" fill="currentColor" />
        <circle cx="24" cy="8" r="3" fill="currentColor" />
      </svg>
    ),
  },
  until: {
    label: 'Repeat until',
    description: 'Repeat the cards inside until the check says yes',
    icon: <LoopArrow />,
  },
};

export const CONDITIONS: Record<ConditionId, { label: string; description: string }> = {
  pathAhead: { label: 'path ahead', description: 'the tile ahead is free' },
  blockedAhead: { label: 'blocked ahead', description: 'the tile ahead is blocked' },
  acornAhead: { label: 'acorn ahead', description: 'an acorn is on the tile ahead' },
  atFlag: { label: 'at the flag', description: 'the robot is standing on the flag' },
};

/** A block's own words, with its count or condition filled in. */
export function describeNode(node: IRNode): string {
  switch (node.kind) {
    case 'repeat':
      return `Repeat ${node.count} times`;
    case 'if':
      return `If ${CONDITIONS[node.condition].label}`;
    case 'ifElse':
      return `If ${CONDITIONS[node.condition].label}, else`;
    case 'until':
      return `Repeat until ${CONDITIONS[node.condition].label}`;
    default:
      return COMMANDS[node.kind].description;
  }
}
