import type { ReactElement } from 'react';
import type { CommandId } from '../ir/types';
import { TurnArrow } from '../render/art';

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
};
