/**
 * Themes map logical elements to presentation. Swapping a theme never changes
 * the simulation: the trace is computed without one.
 */
export type WallVariant = 'rock' | 'tree';

export interface Theme {
  id: string;
  name: string;
  sky: string;
  floor: { tops: string[]; line: string; detail: string; lip: string; lipShade: string };
  gap: { water: string; ripple: string };
  wallVariants: WallVariant[];
  rock: { top: string; edge: string; moss: string };
  tree: { canopy: string; canopyLight: string; canopyShade: string };
  goal: { flag: string; pole: string; tuft: string };
  collectible: { fill: string; shine: string };
  shadow: string;
  indicator: { ok: string; blocked: string };
}

export const forest: Theme = {
  id: 'forest',
  name: 'Forest',
  sky: 'linear-gradient(180deg, #e3f3ff 0%, #f3fbef 100%)',
  floor: { tops: ['#a3d77f', '#9bd277', '#a9db86'], line: '#8cc46c', detail: '#86bf63', lip: '#8a6a4a', lipShade: '#6f5338' },
  gap: { water: '#6fb7d9', ripple: '#a9d8ee' },
  wallVariants: ['rock', 'tree'],
  rock: { top: '#b5bcb8', edge: '#8f9893', moss: '#86b862' },
  tree: { canopy: '#4f9a5c', canopyLight: '#6bb276', canopyShade: '#3d8049' },
  goal: { flag: '#f2c230', pole: '#5b4636', tuft: '#7fbf5c' },
  collectible: { fill: '#f0b429', shine: '#fff3c4' },
  shadow: 'rgba(40, 70, 60, 0.18)',
  indicator: { ok: 'rgba(255, 255, 255, 0.9)', blocked: 'rgba(214, 80, 60, 0.8)' },
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

/** Each gate and its switches share a colour, by the gate's place in the board's list. */
const GATE_COLORS = ['#e9862b', '#8a5cc7', '#d6503c', '#2b8fb5'];
export function gateColor(gateIds: readonly string[], id: string): string {
  const i = gateIds.indexOf(id);
  return GATE_COLORS[(i < 0 ? 0 : i) % GATE_COLORS.length]!;
}
