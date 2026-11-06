/** Small inline icons for stars and badges. Final art arrives in build step 5. */
import type { BadgeId } from '../progress/types';

export function Star({ earned, size = 28 }: { earned: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`star ${earned ? 'is-earned' : ''}`} aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill={earned ? '#f2c230' : 'none'} stroke={earned ? '#d9a816' : 'currentColor'} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export const BADGE_INFO: Record<BadgeId, { name: string; how: string }> = {
  'crystal-ball': { name: 'Crystal ball', how: 'Three correct predictions in a row' },
  wrench: { name: 'Wrench', how: 'Fixed a wrong card on the first try' },
  compass: { name: 'Compass', how: 'Five levels in a row with no bumps' },
  lightning: { name: 'Lightning', how: 'Three levels done with few cards' },
  map: { name: 'Map', how: 'Predicted the tricky board with no hints' },
  trophy: { name: 'Trophy', how: 'Every star in the forest' },
};

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function BadgeIcon({ id, size = 44 }: { id: BadgeId; size?: number }) {
  let glyph;
  switch (id) {
    case 'crystal-ball':
      glyph = (
        <>
          <circle cx={12} cy={10} r={6.5} {...stroke} />
          <path d="M8 19h8M9 16.5h6" {...stroke} />
          <circle cx={10} cy={8} r={1.4} fill="currentColor" />
        </>
      );
      break;
    case 'wrench':
      glyph = <path d="M14.5 4.5a4.5 4.5 0 0 0-4.3 5.9L4 16.6 7.4 20l6.2-6.2a4.5 4.5 0 0 0 5.9-5.9l-2.6 2.6-2.4-.6-.6-2.4z" {...stroke} />;
      break;
    case 'compass':
      glyph = (
        <>
          <circle cx={12} cy={12} r={8.5} {...stroke} />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" />
        </>
      );
      break;
    case 'lightning':
      glyph = <path d="M13 3L5 13.5h6L10 21l9-11h-6z" {...stroke} />;
      break;
    case 'map':
      glyph = <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" {...stroke} />;
      break;
    case 'trophy':
      glyph = <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3M12 14v4M8 20h8" {...stroke} />;
      break;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {glyph}
    </svg>
  );
}
