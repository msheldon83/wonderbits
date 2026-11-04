/**
 * Themes map logical elements to presentation. Swapping a theme never changes
 * the simulation: the trace is computed without one.
 */
export type WallVariant = 'rock' | 'tree';

export interface Theme {
  id: string;
  name: string;
  sky: string;
  floor: { tops: string[]; left: string; right: string; line: string };
  wallVariants: WallVariant[];
  rock: { top: string; left: string; right: string; moss: string };
  tree: { canopy: string; canopyShade: string; trunk: string; base: string };
  goal: { flag: string; pole: string; tuft: string };
  collectible: { fill: string; shine: string };
  shadow: string;
  indicator: { ok: string; blocked: string };
}

export const forest: Theme = {
  id: 'forest',
  name: 'Forest',
  sky: 'linear-gradient(180deg, #e3f3ff 0%, #f3fbef 100%)',
  floor: { tops: ['#a3d77f', '#9bd277', '#a9db86'], left: '#7cb35c', right: '#68a04c', line: '#8cc46c' },
  wallVariants: ['rock', 'tree'],
  rock: { top: '#b5bcb8', left: '#949c98', right: '#7f8783', moss: '#86b862' },
  tree: { canopy: '#4f9a5c', canopyShade: '#3d8049', trunk: '#7a5636', base: '#8fc66e' },
  goal: { flag: '#f2c230', pole: '#5b4636', tuft: '#7fbf5c' },
  collectible: { fill: '#f0b429', shine: '#fff3c4' },
  shadow: 'rgba(60, 90, 80, 0.16)',
  indicator: { ok: 'rgba(255, 255, 255, 0.85)', blocked: 'rgba(214, 80, 60, 0.75)' },
};

export const THEMES: Record<string, Theme> = { forest };

export function themeFor(id: string): Theme {
  return THEMES[id] ?? forest;
}

/** Deterministic per-tile variety so the same level always looks the same. */
export function pick<T>(items: readonly T[], x: number, y: number): T {
  const h = Math.abs((x * 73856093) ^ (y * 19349663));
  return items[h % items.length]!;
}
