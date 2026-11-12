/** What a new creation starts from: an empty island and the cards of free play. */
import type { CardId } from '../ir/types';
import type { TileKind, WorldDefinition } from '../sim/types';
import { withCreationRules } from './cards';
import { SIZE_DEFAULT, SIZE_MAX, SIZE_MIN, type Creation } from './types';

/** The cards every creation starts with: moving, turning and the blocks. */
export const FREE_PLAY_CARDS: readonly CardId[] = ['forward', 'rotateCW', 'rotateCCW', 'repeat', 'if', 'ifElse', 'until'];

/** An empty island: all floor, the robot on the left looking at the flag on the right. */
export function blankWorld(width = 5, height = 5): WorldDefinition {
  const y = Math.floor(height / 2);
  return {
    width,
    height,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, (): TileKind => 'floor')),
    robot: { x: 0, y, facing: 'E' },
    goal: { x: width - 1, y },
    collectibles: [],
  };
}

/** The parts of a blank creation its maker chooses; the store adds the id and the times. */
export function blankCreation(title: string, width: number = SIZE_DEFAULT.width, height: number = SIZE_DEFAULT.height): Omit<Creation, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'> {
  const clamp = (n: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n)));
  return {
    kind: 'puzzle',
    title,
    status: 'draft',
    world: blankWorld(clamp(width), clamp(height)),
    objective: { reachGoal: true, collectAll: false },
    programming: withCreationRules({ allowedCommands: [...FREE_PLAY_CARDS], starterProgram: [] }),
    program: [],
  };
}
