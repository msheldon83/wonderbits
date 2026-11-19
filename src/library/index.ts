/**
 * The library: the ready-made functions a game can use. Each is written to
 * be read, and what the Library screen shows is the very file that runs:
 * the source is imported twice, once as code and once as text.
 */
import lineOfSource from './lineOf.ts?raw';
import steerSource from './steer.ts?raw';
import uncoverSource from './uncover.ts?raw';

export interface LibraryEntry {
  id: string;
  /** How the function is written in code. */
  call: string;
  title: string;
  /** What it is for, in one or two sentences. */
  about: string;
  /** Where a game uses it. */
  usedBy: string;
  /** How it works, a step at a time, in plain words. */
  steps: string[];
  source: string;
}

export const LIBRARY: readonly LibraryEntry[] = [
  {
    id: 'line-of',
    call: 'lineOf(grid, count)',
    title: 'A line of pieces',
    about: 'Which player has so many pieces in a row on a grid: across, down, or on a slant. It answers 1 or 2, or 0 when nobody has.',
    usedBy: 'Noughts and crosses asks it for a line of 3 after every move. Ask for 4 and it is the win check of Connect 4.',
    steps: [
      'Take each tile of the grid in turn, as the start of a line.',
      'If the tile is empty, move on: a line has to start with a piece.',
      'From that tile, look four ways: across, down, slanting down and slanting up.',
      'Each way, count how many tiles in a row hold the same piece.',
      'If the count reaches the number asked for, that player has a line: answer with their number.',
      'If every tile has been tried and no line was found, answer 0.',
    ],
    source: lineOfSource,
  },
  {
    id: 'steer',
    call: 'steer(how, skill, from, target, canWalk, luck, roll)',
    title: 'Moving an enemy',
    about: 'One move for a beetle the game controls. It can chase the robot, run from it, or wander. Its skill is how often it makes its best move.',
    usedBy: 'Acorn chase calls it from its Every tick card, so the beetle takes a step toward the robot as the clock ticks.',
    steps: [
      'To chase: count how many steps every tile is from the robot, spreading out from the robot like ripples, and going round rocks and water.',
      'Look at the tiles beside the beetle and pick the one with the smallest count. That is one step along the shortest way.',
      'To run away: the same counting, but pick the tile with the largest count.',
      'To wander: pick any tile beside the beetle that can be walked on, by a roll of the dice.',
      'Skill: a hard beetle always makes its best move. A medium one does two times in three, and an easy one once in three. The rest of the time it wanders.',
    ],
    source: steerSource,
  },
  {
    id: 'uncover',
    call: 'uncover(shown, mines, at)',
    title: 'Uncovering tiles',
    about: 'Open a covered tile and write on it how many mines touch it. If none do, open the tiles around it as well, and keep going until the open patch is edged with numbers.',
    usedBy: 'Minesweeper calls it when a tile is tapped. It is why one tap can open a whole empty corner.',
    steps: [
      'Keep a list of tiles still to open. It starts with the tile that was tapped.',
      'Take a tile off the list. If it is off the board, already open, or a mine, leave it.',
      'Count the mines in the eight tiles around it, and write that number on the tile.',
      'If the number is 0, no tile around it can be a mine, so add all eight to the list.',
      'Go on until the list is empty.',
    ],
    source: uncoverSource,
  },
];
