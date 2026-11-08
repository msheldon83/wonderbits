import type { ReactElement } from 'react';
import { functionLabel, type CardId, type ConditionId, type IRNode } from '../ir/types';
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
  wait: {
    label: 'Wait',
    description: 'Wait one tick without moving',
    icon: (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M10 5h12M10 27h12M11 5c0 7 10 7 10 11s-10 4-10 11M21 5c0 7-10 7-10 11s10 4 10 11" {...stroke} strokeWidth={2.6} />
      </svg>
    ),
  },
  openGate: {
    label: 'Open gate',
    description: 'Open a gate',
    icon: (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M6 6v20M26 6v20M9 11h4M9 19h4M19 11h4M19 19h4" {...stroke} />
      </svg>
    ),
  },
  closeGate: {
    label: 'Shut gate',
    description: 'Shut a gate',
    icon: (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M6 6v20M26 6v20M6 11h20M6 19h20" {...stroke} />
      </svg>
    ),
  },
  call: {
    label: 'Function',
    description: 'Run the cards of a function',
    icon: <FunctionIcon />,
  },
};

/** Three cards folded into one: a function's icon, on its cards and its heading. */
export function FunctionIcon() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <rect x="6" y="5" width="20" height="6" rx="2" {...stroke} strokeWidth={2.6} />
      <rect x="6" y="13" width="20" height="6" rx="2" {...stroke} strokeWidth={2.6} />
      <rect x="6" y="21" width="20" height="6" rx="2" {...stroke} strokeWidth={2.6} />
    </svg>
  );
}

/** What a card reads: a call reads as its function's name, everything else as its kind. */
export function cardLabel(kind: CardId, name?: string): string {
  return kind === 'call' && name ? functionLabel(name) : COMMANDS[kind].label;
}

export const nodeLabel = (node: IRNode): string => cardLabel(node.kind, node.kind === 'call' ? node.name : undefined);

export const CONDITIONS: Record<ConditionId, { label: string; description: string }> = {
  pathAhead: { label: 'path ahead', description: 'the tile ahead is free' },
  blockedAhead: { label: 'blocked ahead', description: 'the tile ahead is blocked' },
  acornAhead: { label: 'acorn ahead', description: 'an acorn is on the tile ahead' },
  atFlag: { label: 'at the flag', description: 'the robot is standing on the flag' },
  gateClosedAhead: { label: 'gate shut ahead', description: 'a closed gate is on the tile ahead' },
  onSwitch: { label: 'on a switch', description: 'the robot is standing on a switch' },
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
    case 'call':
      return `Run the cards of ${functionLabel(node.name)}`;
    case 'openGate':
      return `Open gate ${node.gate.toUpperCase()}`;
    case 'closeGate':
      return `Shut gate ${node.gate.toUpperCase()}`;
    default:
      return COMMANDS[node.kind].description;
  }
}

const KEY_WORDS: Record<string, string> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right' };

/** A When card's heading: "When plate 1 is stepped on", "When Up is pressed", "Every tick". */
export function eventLabel(event: string): string {
  const [kind, arg] = event.split(':');
  if (kind === 'stepOn') return `When plate ${arg} is stepped on`;
  if (kind === 'key') return `When ${KEY_WORDS[arg ?? ''] ?? arg} is pressed`;
  if (kind === 'acorn') return 'When an acorn is picked up';
  if (kind === 'tick') return 'Every tick';
  return `When ${event}`;
}

/** A short name for the robot's thought bubble: "plate 1!", "Up", "tick". */
export function eventShort(event: string): string {
  const [kind, arg] = event.split(':');
  if (kind === 'stepOn') return `plate ${arg}!`;
  if (kind === 'key') return KEY_WORDS[arg ?? ''] ?? String(arg);
  if (kind === 'acorn') return 'acorn!';
  return 'tick';
}
