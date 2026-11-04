import type { ReactElement } from 'react';
import type { CommandId } from '../ir/types';

export interface CommandInfo {
  label: string;
  /** Spoken by screen readers and used in messages. */
  description: string;
  icon: ReactElement;
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const COMMANDS: Record<CommandId, CommandInfo> = {
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
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M24 11a10 10 0 1 0 2 9" {...stroke} />
        <path d="M25 4v7h-7" {...stroke} />
      </svg>
    ),
  },
  rotateCCW: {
    label: 'Rotate',
    description: 'Rotate counter-clockwise',
    icon: (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M8 11a10 10 0 1 1-2 9" {...stroke} />
        <path d="M7 4v7h7" {...stroke} />
      </svg>
    ),
  },
};
