import { describe, expect, it } from 'vitest';
import type { SimState, WorldDefinition } from '../sim/types';
import { describeValue, memoryLines, memoryValue } from './memory';
import { checkPrediction, predictionComplete } from './prediction';

const world: WorldDefinition = {
  width: 3,
  height: 1,
  tiles: [['floor', 'floor', 'floor']],
  robot: { x: 0, y: 0, facing: 'E' },
  goal: { x: 2, y: 0 },
  collectibles: [{ x: 1, y: 0 }],
  gates: [{ id: 'a', x: 2, y: 0, open: false }],
  switches: [{ x: 1, y: 0, toggles: ['a'] }],
};
const end: SimState = { robot: { x: 2, y: 0, facing: 'S' }, collected: ['1,0'], open: ['a'] };

describe('memory card', () => {
  it('lists position, facing, acorns where there are acorns, and every gate', () => {
    expect(memoryLines(world).map((l) => [l.field, l.kind])).toEqual([
      ['position', 'position'],
      ['facing', 'direction'],
      ['acorns', 'number'],
      ['gate:a', 'yesNo'],
    ]);
    expect(memoryLines({ ...world, collectibles: [], gates: [] }).map((l) => l.field)).toEqual(['position', 'facing']);
  });

  it('reads values from a state and says them in words', () => {
    expect(memoryValue(end, 'facing')).toBe('S');
    expect(memoryValue(end, 'acorns')).toBe(1);
    expect(memoryValue(end, 'gate:a')).toBe(true);
    expect([describeValue('S'), describeValue(1), describeValue(false)]).toEqual(['down', '1', 'no']);
  });
});

describe('predicting the memory card', () => {
  const settings = { askTile: false, askMemory: ['gate:a', 'facing'] as const };

  it('is complete only when every asked part has an answer', () => {
    const asked = { askTile: false, askMemory: [...settings.askMemory] };
    expect(predictionComplete(null, asked)).toBe(false);
    expect(predictionComplete({ memory: { 'gate:a': true } }, asked)).toBe(false);
    expect(predictionComplete({ memory: { 'gate:a': false, facing: 'N' } }, asked)).toBe(true);
    expect(predictionComplete({ memory: { 'gate:a': false, facing: 'N' } }, { ...asked, askTile: true })).toBe(false);
  });

  it('names the fields guessed wrong, and the tile only when asked', () => {
    const asked = { askTile: false, askMemory: [...settings.askMemory] };
    expect(checkPrediction({ memory: { 'gate:a': true, facing: 'S' } }, asked, end)).toEqual({ tileRight: null, wrongFields: [], correct: true });
    expect(checkPrediction({ memory: { 'gate:a': false, facing: 'S' } }, asked, end)).toEqual({ tileRight: null, wrongFields: ['gate:a'], correct: false });
    const withTile = checkPrediction({ cell: { x: 1, y: 0 }, memory: { 'gate:a': true, facing: 'S' } }, { ...asked, askTile: true }, end);
    expect(withTile).toEqual({ tileRight: false, wrongFields: [], correct: false });
  });
});
