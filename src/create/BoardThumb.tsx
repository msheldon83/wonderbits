/** A small picture of a board for the shelf: tiles, the robot and the flag. No art, no animation. */
import type { WorldDefinition } from '../sim/types';

const FILL = { floor: '#bfe3a8', wall: '#8a97a6', gap: '#8fcdf0' } as const;

export function BoardThumb({ world, size = 120 }: { world: WorldDefinition; size?: number }) {
  const { width, height } = world;
  const scale = size / Math.max(width, height);
  return (
    <svg className="board-thumb" viewBox={`0 0 ${width} ${height}`} width={width * scale} height={height * scale} aria-hidden="true">
      {world.tiles.map((row, y) => row.map((t, x) => <rect key={`${x},${y}`} x={x + 0.04} y={y + 0.04} width={0.92} height={0.92} rx={0.16} fill={FILL[t]} />))}
      {world.collectibles.map((c) => (
        <circle key={`a${c.x},${c.y}`} cx={c.x + 0.5} cy={c.y + 0.5} r={0.2} fill="#b8701a" />
      ))}
      {(world.gates ?? []).map((g) => (
        <rect key={`g${g.id}`} x={g.x + 0.2} y={g.y + 0.3} width={0.6} height={0.4} rx={0.08} fill="#8a5cc7" />
      ))}
      <path d={`M${world.goal.x + 0.34} ${world.goal.y + 0.84}V${world.goal.y + 0.18}l0.42 0.17-0.42 0.17`} fill="#d6503c" stroke="#d6503c" strokeWidth={0.07} strokeLinejoin="round" />
      <circle cx={world.robot.x + 0.5} cy={world.robot.y + 0.5} r={0.3} fill="#3291d6" stroke="#fff" strokeWidth={0.08} />
    </svg>
  );
}
