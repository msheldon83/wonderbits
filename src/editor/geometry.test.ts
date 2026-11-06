import { describe, expect, it } from 'vitest';
import { gapCentres, slotForY } from './geometry';

const rows = [
  { top: 0, height: 56 },
  { top: 64, height: 56 },
  { top: 128, height: 56 },
];

describe('gapCentres', () => {
  it('puts one gap before each row and one after the last', () => {
    expect(gapCentres(rows, 8)).toEqual([-4, 60, 124, 188]);
  });
  it('has a single gap for an empty program', () => {
    expect(gapCentres([], 8)).toEqual([0]);
  });
});

describe('slotForY', () => {
  it('picks the gap nearest the pointer', () => {
    expect(slotForY(rows, -20)).toBe(0);
    expect(slotForY(rows, 27)).toBe(0);
    expect(slotForY(rows, 29)).toBe(1);
    expect(slotForY(rows, 100)).toBe(2);
    expect(slotForY(rows, 500)).toBe(3);
    expect(slotForY([], 10)).toBe(0);
  });
});
