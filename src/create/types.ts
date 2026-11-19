/**
 * A creation: something a child made. It is data, never code: a board, its
 * rules, and the maker's own program, in versioned JSON that is read back
 * through the same parser as a level file. A creation is looser than a
 * level: it has no hints, no stars and no curriculum.
 */
import type { NodeSpec } from '../ir/spec';
import type { Key, Value } from '../ir/types';
import type { LiveInput } from '../runtime/contract';
import type { PuzzleDefinition } from '../lessons/types';
import type { ObjectiveDefinition, WorldDefinition } from '../sim/types';

export const CREATION_SCHEMA_VERSION = 1 as const;

/** A puzzle for the robot now; a game arrives with the Workshop. */
export type CreationKind = 'puzzle' | 'game';

/**
 * draft: still being made; only its maker plays it.
 * proved: its maker solved it under its own limits, so others may play it.
 */
export type CreationStatus = 'draft' | 'proved';

/** The maker's own solution, under the limits the puzzle had when it was solved. */
export interface Proof {
  solution: NodeSpec[];
  /** Cards in the solution. */
  steps: number;
  provedAt: number;
}

export interface Creation {
  schemaVersion: typeof CREATION_SCHEMA_VERSION;
  /** Made on this device; not a level id. */
  id: string;
  kind: CreationKind;
  title: string;
  /** A nickname: the signed-in child's, or a brother or sister's for something they sent. Never a real name or an account. */
  madeBy?: string;
  /** The level it was remixed from, if any. */
  basedOn?: string;
  createdAt: number;
  updatedAt: number;
  status: CreationStatus;
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  /** The cards and limits a player gets. Its starter program is what a player opens with. */
  programming: PuzzleDefinition['programming'];
  inputScript?: Key[];
  days?: number;
  /** A clock, in ticks a second: the world moves by itself while the puzzle is played. Without it, the world moves when the robot does. */
  clock?: number;
  /** A game with no robot in it, such as a board game: the robot is not drawn. */
  hideRobot?: boolean;
  /** How to play, said to the player before the first go. */
  how?: string;
  /** Things to try changing, smallest first: a starter game's ladder. They are suggestions and nothing more. */
  tries?: string[];
  /** A game's backpack, for real: what its kept memory held when the last game ended, there again next time. */
  saved?: Record<string, Value>;
  /** The maker's last winning play of a live puzzle: its keys and ticks, and its seed. Played back against the puzzle as it now is, it shows whether the puzzle is still won. */
  replay?: { inputs: LiveInput[]; seed: number; saved?: Record<string, Value> };
  /** The maker's own program, saved as they go. */
  program: NodeSpec[];
  proof?: Proof;
}

export const TITLE_MAX = 40;
/** The coordinate cards count rows and columns from 0 to 15. */
export const BOARD_MAX = 16;
export const BOARD_MIN = 1;
/** The sizes a maker can choose: big enough for a puzzle, small enough to see whole on an iPad. */
export const SIZE_MIN = 3;
export const SIZE_MAX = 12;
/** A new island's size until its maker says otherwise. */
export const SIZE_DEFAULT = { width: 5, height: 5 } as const;
/** How fast a creation's clock may tick, a second. */
export const CLOCKS = [1, 2, 4] as const;
/** As many inputs as a kept winning play may hold. */
export const REPLAY_MAX = 5000;
/** As many things to try as a game lists, and how long each may be. */
export const TRIES_MAX = 6;
export const TRY_LENGTH = 220;
