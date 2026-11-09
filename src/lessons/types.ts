import type { NodeSpec } from '../ir/spec';
import type { CardId, ConditionId, Key, MemorySlot, Source } from '../ir/types';
import type { Cell, Facing, ObjectiveDefinition, WorldDefinition } from '../sim/types';

export const CONTENT_SCHEMA_VERSION = 1 as const;

/**
 * run: the program is given and locked; the child predicts, then runs.
 * build: the child builds the program from the palette.
 * reorder: the child orders a fixed set of supplied cards (Parsons).
 * debug: a pre-filled program has one wrong instruction to repair.
 * predict: the program is given and locked; the child predicts tile and facing.
 * model: the program is given and locked; the child fills in the memory card
 *   as it will be at the end of the run, field by field, then runs it.
 */
export type Activity = 'run' | 'build' | 'reorder' | 'debug' | 'predict' | 'model';

/**
 * A line of the memory card the child can be asked to predict: which way the
 * robot faces, how many acorns it holds, or whether a gate is open.
 */
export type MemoryField = 'facing' | 'acorns' | `gate:${string}` | `slot:${string}`;
/** A memory card value: a direction, a number, or a yes/no. */
export type MemoryValue = Facing | number | boolean;

/**
 * Where inside a program a hint points. Each number enters that card's body;
 * "else" right after a number enters its else branch instead. Empty means
 * the main program. For example [1, "else", 0] is the body of the first card
 * inside the else branch of the second card. A function's name first starts
 * in that function instead: ["hop"] is the top of Hop.
 */
export type HintPath = (number | string)[];

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

/** Prediction asks where the robot will end up, and on later levels what its memory card will say. */
export interface PredictionSettings {
  askTile: boolean;
  /** Memory card fields to fill in before the run. */
  askMemory?: MemoryField[];
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
    /** The memory budget: how many slots the robot may keep. */
    maxMemory?: number;
    /** Slots the child may choose to keep, under the budget. Without it, the starter program's slots are fixed. */
    memoryOptions?: MemorySlot[];
    /** What Set cards may put in a slot. Every value that fits the slot when left out. */
    allowedSources?: Source[];
  };
  /** When set, the level opens in prediction mode before Run is enabled. */
  prediction?: PredictionSettings;
  /** Input levels: the key presses played after the program, in order. Each fires its When card. */
  inputScript?: Key[];
  /**
   * Shuffled levels: other versions of the board. The level is solved only
   * when one program works on every version, the main board included.
   */
  shuffles?: WorldDefinition[];
  hints: [HintStep, HintStep, HintStep];
  /** Required on every level; validators prove it works. */
  referenceSolution: NodeSpec[];
  stars: { noHints: boolean; budget?: number };
}

/**
 * How a pack introduces its concept: show before tell. The demo is a tiny
 * board and a program the robot plays on it, over and over, with the cards
 * lighting up and the same program printed as code beside them. When the
 * demo has a `before` program, the old way plays first, then its cards fold
 * into the new one. The explanation is one sentence in kid terms. All of it
 * goes into the card book the child can open anytime.
 */
export interface ConceptIntroduction {
  /** The concept id this introduces; must be one of the pack's concepts. */
  concept: string;
  /** The name of the new idea as the child will see it, such as "Repeat". */
  title: string;
  /** One sentence in kid terms, shown beside the new card. */
  explanation: string;
  demo: {
    world: WorldDefinition;
    /** The program that shows the new idea. It must reach the flag. */
    program: NodeSpec[];
    /** The old way, played first, whose cards fold into `program`. Optional. */
    before?: NodeSpec[];
    /** Key presses played after the program, for the input introduction. */
    input?: Key[];
    /** Other versions of the board, for the randomness introduction: the same program plays on each. */
    shuffles?: WorldDefinition[];
  };
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
  /** Concept ids this pack teaches or practises, such as "sequencing" or "loops". */
  concepts: string[];
  /** Ids of packs that should be played first. Together with concepts this is the concept graph. */
  prerequisites: string[];
  /** The show-first introduction to the pack's new concept. Absent on a pack that only practises. */
  introduction?: ConceptIntroduction;
}

/** What the child predicted before a run: the tile, and any memory card fields asked. */
export interface Prediction {
  cell?: Cell;
  memory?: Partial<Record<MemoryField, MemoryValue>>;
}
