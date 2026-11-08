import type { NodeSpec } from '../ir/spec';
import type { CardId, ConditionId } from '../ir/types';
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
 * Where inside a program a hint points. Each number enters that card's body;
 * "else" right after a number enters its else branch instead. Empty means
 * the main program. For example [1, "else", 0] is the body of the first card
 * inside the else branch of the second card.
 */
export type HintPath = (number | 'else')[];

/**
 * A deterministic three-rung hint ladder: orient attention on the board,
 * identify the card or step that matters, then fill one slot. The solution
 * itself is never given.
 */
export type HintStep =
  | { kind: 'region'; cells: Cell[]; text: string }
  | { kind: 'card'; command: CardId; text: string }
  | { kind: 'step'; path: HintPath; index: number; text: string }
  | { kind: 'fill'; path: HintPath; slot: number; command: CardId; text: string };

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
    /** Cards the palette offers: commands and blocks. */
    allowedCommands: CardId[];
    /** What If and Repeat until may sense. Every condition when left out. */
    allowedConditions?: ConditionId[];
    maxInstructions?: number;
    maxPerCommand?: Partial<Record<CardId, number>>;
    /** How deeply blocks may nest; 1 means a block may not hold a block. */
    maxNestingDepth?: number;
    starterProgram: NodeSpec[];
    /** Cards handed to the child on reorder (Parsons) levels. */
    suppliedCards?: CardId[];
  };
  /** When set, the level opens in prediction mode before Run is enabled. */
  prediction?: PredictionSettings;
  hints: [HintStep, HintStep, HintStep];
  /** Required on every level; validators prove it works. */
  referenceSolution: NodeSpec[];
  stars: { noHints: boolean; budget?: number };
}

export interface PackManifest {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  id: string;
  title: string;
  themeId: string;
  /** Packs play in ascending order, then by path. */
  order: number;
  /** Level ids in play order; each is a file levels/<id>.json in the pack. */
  levels: string[];
}

/** What the child predicted before a run. */
export interface Prediction {
  cell: Cell;
}
