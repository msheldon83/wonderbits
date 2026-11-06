import type { CommandId } from '../ir/types';
import type { Cell, ObjectiveDefinition, WorldDefinition } from '../sim/types';

export const CONTENT_SCHEMA_VERSION = 1 as const;

/**
 * run: the program is given and locked; the child predicts, then runs.
 * build: the child builds the program from the palette.
 * reorder: the child orders a fixed set of supplied cards (Parsons).
 * debug: a pre-filled program has one wrong instruction to repair.
 * predict: the program is given and locked; the child predicts tile and facing.
 */
export type Activity = 'run' | 'build' | 'reorder' | 'debug' | 'predict';

/**
 * A deterministic three-rung hint ladder: orient attention on the board,
 * identify the card or step that matters, then fill one slot. The solution
 * itself is never given.
 */
export type HintStep =
  | { kind: 'region'; cells: Cell[]; text: string }
  | { kind: 'card'; command: CommandId; text: string }
  | { kind: 'step'; index: number; text: string }
  | { kind: 'fill'; slot: number; command: CommandId; text: string };

/** Prediction asks where the robot will end up. Kept as an object so later levels can ask more. */
export interface PredictionSettings {
  askTile: boolean;
}

export interface PuzzleDefinition {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  id: string;
  title: string;
  /** One short sentence shown before the first run. Optional. */
  intro?: string;
  themeId: string;
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  curriculum: { concept: string; activity: Activity };
  programming: {
    allowedCommands: CommandId[];
    maxInstructions?: number;
    maxPerCommand?: Partial<Record<CommandId, number>>;
    /** Unused until Repeat arrives. */
    maxNestingDepth?: number;
    starterProgram: CommandId[];
    /** Cards handed to the child on reorder (Parsons) levels. */
    suppliedCards?: CommandId[];
  };
  /** When set, the level opens in prediction mode before Run is enabled. */
  prediction?: PredictionSettings;
  hints: [HintStep, HintStep, HintStep];
  /** Required on every level; validators prove it works. */
  referenceSolution: CommandId[];
  stars: { noHints: boolean; budget?: number };
}

export interface PackManifest {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  id: string;
  title: string;
  themeId: string;
  /** Level ids in play order; each is a file levels/<id>.json in the pack. */
  levels: string[];
}

/** What the child predicted before a run. */
export interface Prediction {
  cell: Cell;
}
