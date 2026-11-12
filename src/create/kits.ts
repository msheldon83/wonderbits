/**
 * Kits: the ideas of the later packs, ready to add to a creation in one
 * tap. A kit brings its cards and the named parts they work on (a counter
 * called count, the bird, a backpack), so nothing has to be typed. Adding
 * a kit never takes anything away, and adding it twice changes nothing.
 */
import { splitSpec, type NodeSpec } from '../ir/spec';
import type { CardId, Source } from '../ir/types';
import { inPaletteOrder } from './cards';
import type { Creation } from './types';

export interface Kit {
  id: string;
  title: string;
  /** One sentence in kid terms. */
  blurb: string;
  /** The pack where the robot learns it. */
  packId: string;
  cards: CardId[];
  /** Values a Set card gains: a die, a coin, the bird's answer. */
  sources?: Source[];
  /** Named parts added to the maker's program, empty: memory, functions, When cards. */
  parts?: NodeSpec[];
  /** The backpack needs more than one day. */
  days?: number;
}

export const KITS: readonly Kit[] = [
  { id: 'trick', title: 'A trick with a name', blurb: 'A function: cards you build once, name, and use again and again.', packId: 'forest-functions', cards: ['call'], parts: [{ define: 'trick', do: [] }] },
  { id: 'when', title: 'When it happens', blurb: 'A card that runs each time the robot picks up an acorn, and cards that open and shut gates.', packId: 'forest-events', cards: ['openGate', 'closeGate'], parts: [{ on: 'acorn', do: [] }] },
  { id: 'time', title: 'Tick tock', blurb: 'Wait a moment, and a card that runs on every tick of the clock.', packId: 'forest-time', cards: ['wait'], parts: [{ on: 'tick', do: [] }] },
  { id: 'way', title: 'A way to remember', blurb: 'The robot keeps a direction in its memory and can face it again later.', packId: 'forest-memory', cards: ['set', 'face'], parts: [{ remember: 'way', kind: 'direction', start: 'N' }] },
  { id: 'counter', title: 'A counter', blurb: 'A number the robot can set, add to, and check.', packId: 'forest-count', cards: ['set', 'change'], parts: [{ remember: 'count', kind: 'number', start: 0 }] },
  {
    id: 'list',
    title: 'A list',
    blurb: 'A list of directions the robot can add to and walk through, one at a time.',
    packId: 'forest-lists',
    cards: ['push', 'forEach', 'face'],
    parts: [
      { remember: 'route', kind: 'list', of: 'direction', start: [] },
      { remember: 'step', kind: 'direction', start: 'N' },
    ],
  },
  { id: 'die', title: 'A die and a coin', blurb: 'A number called roll to hold a random number. Set it to a roll of the die, or set a yes or no to a coin flip. The puzzle must work whatever comes up.', packId: 'forest-shuffle', cards: ['set'], parts: [{ remember: 'roll', kind: 'number', start: 0 }] },
  { id: 'map', title: 'Rows and columns', blurb: 'Walk straight to a row or a column by its number.', packId: 'forest-grids', cards: ['goRow', 'goColumn'] },
  {
    id: 'bird',
    title: 'The bird',
    blurb: 'A bird that flies over the island and tells the robot how many acorns are left.',
    packId: 'forest-grids',
    cards: ['fly', 'set'],
    sources: ['acornsLeft'],
    parts: [
      { remember: 'bird', kind: 'position', start: { x: 0, y: 0 } },
      { remember: 'left', kind: 'number', start: 0 },
    ],
  },
  { id: 'backpack', title: 'The backpack', blurb: 'The puzzle runs for two days. What is in the backpack is still there the next morning.', packId: 'forest-overnight', cards: ['set', 'change'], parts: [{ remember: 'kept', kind: 'number', start: 0, keep: true }], days: 2 },
];

/** The names a program already uses: its slots and functions by name, its When cards by event. */
function namesIn(spec: readonly NodeSpec[]): { names: Set<string>; events: Set<string> } {
  const { functions, handlers, memory } = splitSpec(spec);
  return { names: new Set([...functions.map((f) => f.name), ...memory.map((m) => m.name)]), events: new Set(handlers.map((h) => h.event)) };
}

/** A kit's parts that the program does not have yet. A name already taken, by anything, is left as it is. */
function missingParts(kit: Kit, program: readonly NodeSpec[]): NodeSpec[] {
  const { names, events } = namesIn(program);
  return (kit.parts ?? []).filter((p) => {
    if (typeof p === 'string') return false;
    if ('remember' in p) return !names.has(p.remember);
    if ('define' in p) return !names.has(p.define);
    if ('on' in p) return !events.has(p.on);
    return false;
  });
}

/** True when a creation already has everything a kit brings. */
export function hasKit(creation: Pick<Creation, 'programming' | 'program' | 'days'>, kit: Kit): boolean {
  const sources = creation.programming.allowedSources ?? [];
  return kit.cards.every((c) => creation.programming.allowedCommands.includes(c)) && (kit.sources ?? []).every((s) => sources.includes(s)) && missingParts(kit, creation.program).length === 0 && (kit.days === undefined || creation.days !== undefined);
}

/** What changes when a kit is added: the cards, the sources, the maker's program and, for the backpack, the days. */
export function applyKit(creation: Pick<Creation, 'programming' | 'program' | 'days'>, kit: Kit): Pick<Creation, 'programming' | 'program'> & { days?: number } {
  const { programming } = creation;
  const sources = [...new Set([...(programming.allowedSources ?? []), ...(kit.sources ?? [])])];
  return {
    programming: {
      ...programming,
      allowedCommands: inPaletteOrder([...new Set([...programming.allowedCommands, ...kit.cards])]),
      ...(sources.length > 0 && { allowedSources: sources }),
      ownNames: true,
    },
    // Named parts go first, the way a level file lists them; the maker's cards stay as they are.
    program: [...missingParts(kit, creation.program), ...creation.program],
    ...(kit.days !== undefined && creation.days === undefined ? { days: kit.days } : creation.days !== undefined ? { days: creation.days } : {}),
  };
}
