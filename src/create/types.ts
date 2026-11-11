/**
 * A creation: something a child made. It is data, never code: a board, its
 * rules, and the maker's own program, in versioned JSON that is read back
 * through the same parser as a level file. A creation is looser than a
 * level: it has no hints, no stars and no curriculum.
 */
import type { NodeSpec } from '../ir/spec';
import type { Key } from '../ir/types';
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
  /** A nickname. There are no accounts. */
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
  /** The maker's own program, saved as they go. */
  program: NodeSpec[];
  proof?: Proof;
}

export const TITLE_MAX = 40;
/** The coordinate cards count rows and columns from 0 to 15. */
export const BOARD_MAX = 16;
export const BOARD_MIN = 2;
