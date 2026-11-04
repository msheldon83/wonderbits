import type { CommandId } from '../ir/types';
import type { ObjectiveDefinition, WorldDefinition } from '../sim/types';

export const CONTENT_SCHEMA_VERSION = 1 as const;

export type Activity = 'run' | 'build' | 'reorder' | 'debug' | 'predict';

export interface PuzzleDefinition {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  id: string;
  title: string;
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
  /** Required on every level; validators prove it works. */
  referenceSolution: CommandId[];
  stars: { noHints: boolean; budget?: number };
  // Prediction settings and hint ladders arrive in build step 4.
}

export interface PackManifest {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  id: string;
  title: string;
  themeId: string;
  /** Level ids in play order; each is a file levels/<id>.json in the pack. */
  levels: string[];
}
