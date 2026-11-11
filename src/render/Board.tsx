import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Cell, WorldDefinition } from '../sim/types';
import { cellKey, gatesOf, initialState, moverCell, moverLabel, moversOf, platesOf, switchesOf, tileAt } from '../sim/world';
import { Anchored, ARROW_POINTS, BeetleArt, Collectible, CUE_BOX, FloorTile, GateArt, GhostRobot, GoalFlag, Lip, LogArt, PlateArt, Robot, ROBOT_BOX, Rock, SwitchArt, Tree, TurnCue, Water } from './art';
import { BoardController, type MotionSettings, type RobotElements } from './controller';
import { LAYER, LIP, layoutFor, TILE, toScreen } from './grid';
import { gateColor, pick, type Theme } from './themes';

export interface BoardProps {
  world: WorldDefinition;
  theme: Theme;
  motion: MotionSettings;
  label: string;
  /** Receives one controller per robot; the first drives the lesson. */
  onControllers(controllers: BoardController[] | null): void;
  /** Extra robots for the performance check. Lessons use one. */
  robotCount?: number;
  /** Largest scale the board may grow to, so small boards do not look blurry. */
  maxScale?: number;
  /** When set, every tile is a button and tapping one reports its cell. */
  onTileTap?: (cell: Cell) => void;
  /** The child's flags: the one placed now, and earlier wrong guesses. */
  marks?: { cell: Cell; state: 'pending' | 'right' | 'wrong' }[];
  /** Place slots drawn on the board: the one named bird is the bird, over its tile; any other is a pointing hand. */
  pointers?: { name: string; cell: Cell }[];
  /** Cells a hint is pointing at. */
  highlightCells?: Cell[];
  /** Hide the next-tile ghost, for prediction levels before the guess is made. */
  hideIndicator?: boolean;
  /** Hide the real flag: on prediction levels the child places one instead. */
  hideGoal?: boolean;
  /** Number the rows and columns around the board, for levels that read it as a grid. */
  coordinates?: boolean;
  /** Records standing on the board, such as a sign: each field a line, the one being read lit up. */
  signs?: { name: string; cell: Cell; lines: { field: string; text: string }[]; focus?: string }[];
  /** The bird: it flies over the board, sees all of it, and answers when the robot asks. */
  bird?: boolean;
  /** Tile buttons without the dashed outline that says "pick one": for the board editor, where every tile takes a tool. */
  plainTiles?: boolean;
}

/** The bird, side on, wings up: a round body, a beak, an eye and a tail. */
function BirdArt() {
  return (
    <svg width={64} height={56} viewBox="0 0 64 56" aria-hidden="true">
      <path d="M14 30 L2 24 L8 34 Z" fill="#a3311a" />
      <ellipse cx={32} cy={32} rx={18} ry={14} fill="#e2502c" />
      <ellipse cx={34} cy={37} rx={11} ry={7} fill="#fde8c8" />
      <path className="bird-wing" d="M26 26 Q30 6 44 10 Q38 22 34 30 Z" fill="#a3311a" />
      <circle cx={44} cy={22} r={10} fill="#e2502c" />
      <path d="M40 16 L54 22 L44 24 Z" fill="#1f2a3d" opacity={0.85} />
      <circle cx={47} cy={20} r={2.6} fill="#fff" />
      <circle cx={47.6} cy={20} r={1.5} fill="#1f2a3d" />
      <path d="M53 22 L62 25 L53 28 Z" fill="#f7c531" />
      <path d="M28 46 v6 M36 46 v6" stroke="#f7c531" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export function Board({ world, theme, motion, label, onControllers, robotCount = 1, maxScale = 1.6, onTileTap, marks = [], pointers = [], highlightCells, hideIndicator = false, hideGoal = false, coordinates = false, bird = false, signs = [], plainTiles = false }: BoardProps) {
  const layout = useMemo(() => layoutFor(world, coordinates), [world, coordinates]);
  const viewport = useRef<HTMLDivElement>(null);
  const robotEls = useRef<Partial<RobotElements>[]>([]);
  const gems = useRef(new Map<string, HTMLElement>());
  const gateEls = useRef(new Map<string, HTMLElement>());
  const switchEls = useRef(new Map<string, HTMLElement>());
  const moverEls = useRef(new Map<string, HTMLElement>());
  const ghostEls = useRef(new Map<string, HTMLElement>());
  const teammateEls = useRef(new Map<number, HTMLElement>());
  const birdEls = useRef<{ root?: HTMLElement; bubble?: HTMLElement }>({});
  const birdCell = pointers.find((p) => p.name === 'bird')?.cell;
  const showBird = bird || birdCell !== undefined;
  const controllers = useRef<BoardController[]>([]);
  const elsFor = (i: number) => (robotEls.current[i] ??= {});
  const [scale, setScale] = useState(1);

  // Fit the stage to the space the layout gives the board.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setScale(Math.max(0.3, Math.min(maxScale, width / layout.stageW, height / layout.stageH)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, maxScale]);

  useLayoutEffect(() => {
    const cs = Array.from({ length: robotCount }, (_, i) => {
      const els = robotEls.current[i] as RobotElements;
      const c = new BoardController(world, layout, els, i === 0 ? gems.current : new Map(), theme.indicator, motion, i === 0 ? { gates: gateEls.current, switches: switchEls.current, movers: moverEls.current, ghosts: ghostEls.current, teammates: teammateEls.current, ...(showBird && birdEls.current.root && birdEls.current.bubble && { bird: { root: birdEls.current.root, bubble: birdEls.current.bubble } }) } : undefined);
      c.showState(initialState(world));
      return c;
    });
    controllers.current = cs;
    onControllers(cs);
    return () => {
      controllers.current = [];
      onControllers(null);
    };
    // Motion changes are applied below without rebuilding the controllers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, layout, theme, onControllers, robotCount, showBird]);

  useEffect(() => {
    for (const c of controllers.current) c.motion = motion;
  }, [motion]);

  useEffect(() => {
    for (const c of controllers.current) c.setIndicatorVisible(!hideIndicator);
  }, [hideIndicator]);

  // Terrain is one SVG drawn in a fixed order: floors, lips, then walls.
  const floors: ReactElement[] = [];
  const lips: ReactElement[] = [];
  const walls: ReactElement[] = [];
  const solid = (x: number, y: number) => {
    const t = tileAt(world, { x, y });
    return t === 'floor' || t === 'wall';
  };
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const tile = world.tiles[y]![x]!;
      const p = toScreen(layout, { x, y });
      const at = `translate(${p.x} ${p.y})`;
      if (tile === 'gap') {
        floors.push(
          <g key={`g${x},${y}`} transform={at}>
            <Water theme={theme} />
          </g>,
        );
        continue;
      }
      floors.push(
        <g key={`f${x},${y}`} transform={at}>
          <FloorTile theme={theme} x={x} y={y} />
        </g>,
      );
      if (!solid(x, y + 1)) {
        lips.push(
          <g key={`l${x},${y}`} transform={at}>
            <Lip theme={theme} />
          </g>,
        );
      }
      if (tile === 'wall') {
        const variant = pick(theme.wallVariants, x, y);
        walls.push(
          <g key={`w${x},${y}`} transform={at} className={`wall wall-${variant}`}>
            {variant === 'tree' ? <Tree theme={theme} /> : <Rock theme={theme} />}
          </g>,
        );
      }
    }
  }

  const objects: ReactElement[] = [];
  const goal = toScreen(layout, world.goal);
  if (!hideGoal && !world.team) {
    objects.push(
      <Anchored key="goal" x={goal.x} y={goal.y} size={TILE} z={LAYER.goal} className="goal" label="Goal flag">
        <GoalFlag theme={theme} />
      </Anchored>,
    );
  }
  // A team board: each robot has its own flag, numbered and in its colour.
  if (!hideGoal) {
    (world.team ?? []).forEach((t, i) => {
      const g = toScreen(layout, t.goal);
      objects.push(
        <Anchored key={`goal${i}`} x={g.x} y={g.y} size={TILE} z={LAYER.goal} className={`goal team-goal team-${i}`} label={`Robot ${i + 1}'s flag`}>
          <GoalFlag theme={theme} />
          <circle cx={TILE / 2 - 20} cy={-TILE / 2 + 20} r={14} className="team-badge" />
          <text x={TILE / 2 - 20} y={-TILE / 2 + 26} textAnchor="middle" fontSize={17} fontWeight={800} fill="#fff">
            {i + 1}
          </text>
        </Anchored>,
      );
    });
  }
  for (const c of world.collectibles) {
    const p = toScreen(layout, c);
    const key = cellKey(c);
    objects.push(
      <div
        key={`c${key}`}
        ref={(el) => {
          if (el) gems.current.set(key, el);
          else gems.current.delete(key);
        }}
        className="collectible-wrap"
        style={{ position: 'absolute', left: p.x - TILE / 2, top: p.y - TILE / 2, width: TILE, height: TILE, zIndex: LAYER.collectible }}
      >
        <Anchored x={TILE / 2} y={TILE / 2} size={TILE} z={0} label="Collectible">
          <Collectible theme={theme} />
        </Anchored>
      </div>,
    );
  }

  // World state: switch plates under everything, gates at the robot's level so a shut one reads as a wall.
  const gateIds = gatesOf(world).map((g) => g.id);
  for (const sw of switchesOf(world)) {
    const p = toScreen(layout, sw);
    const key = cellKey(sw);
    const id = sw.toggles[0] ?? '';
    const letters = sw.toggles.map((t) => t.toUpperCase()).join('');
    objects.push(
      <div
        key={`s${key}`}
        ref={(el) => {
          if (el) switchEls.current.set(key, el);
          else switchEls.current.delete(key);
        }}
        className="switch-wrap"
        style={{ position: 'absolute', left: p.x - TILE / 2, top: p.y - TILE / 2, width: TILE, height: TILE, zIndex: LAYER.goal - 1 }}
      >
        <Anchored x={TILE / 2} y={TILE / 2} size={TILE} z={0} label={`Switch for gate ${letters}`}>
          <SwitchArt color={gateColor(gateIds, id)} letter={letters} />
        </Anchored>
      </div>,
    );
  }
  for (const g of gatesOf(world)) {
    const p = toScreen(layout, g);
    objects.push(
      <div
        key={`gate${g.id}`}
        ref={(el) => {
          if (el) gateEls.current.set(g.id, el);
          else gateEls.current.delete(g.id);
        }}
        className="gate-wrap"
        data-open={String(g.open)}
        style={{ position: 'absolute', left: p.x - TILE / 2, top: p.y - TILE / 2, width: TILE, height: TILE, zIndex: LAYER.collectible + 1 }}
      >
        <Anchored x={TILE / 2} y={TILE / 2} size={TILE} z={0} label={`Gate ${g.id.toUpperCase()}${g.code !== undefined ? `, opened by the number ${g.code}` : ''}`}>
          <GateArt color={gateColor(gateIds, g.id)} letter={g.id.toUpperCase()} {...(g.code !== undefined && { code: g.code })} />
        </Anchored>
      </div>,
    );
  }

  // Events: plates lie flat like switches. Time: logs float under the robot, beetles walk beside it.
  for (const plate of platesOf(world)) {
    const p = toScreen(layout, plate);
    objects.push(
      <Anchored key={`p${plate.id}`} x={p.x} y={p.y} size={TILE} z={LAYER.goal - 1} className="plate" label={`Plate ${plate.id}`}>
        <PlateArt label={plate.id} />
      </Anchored>,
    );
  }
  for (const m of moversOf(world)) {
    const start = toScreen(layout, moverCell(m, 0));
    // Where it will be on the next tick: a dashed outline with an arrow, placed by the controller.
    objects.push(
      <div
        key={`gh${m.id}`}
        ref={(el) => {
          if (el) ghostEls.current.set(m.id, el);
          else ghostEls.current.delete(m.id);
        }}
        className={`mover-ghost mover-ghost-${m.kind}`}
        aria-hidden="true"
        style={{ position: 'absolute', left: 0, top: 0, width: TILE, height: TILE, opacity: 0, zIndex: m.kind === 'log' ? LAYER.goal - 3 : LAYER.indicator }}
      >
        <svg width={TILE} height={TILE} viewBox={`${-TILE / 2} ${-TILE / 2} ${TILE} ${TILE}`}>
          <rect x={-40} y={-30} width={80} height={60} rx={22} fill="none" strokeWidth={4} strokeDasharray="9 7" />
          <path className="mover-ghost-arrow" d="M0 14 V-12 M-9 -3 L0 -13 L9 -3" fill="none" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>,
    );
    objects.push(
      <div
        key={`mv${m.id}`}
        ref={(el) => {
          if (el) moverEls.current.set(m.id, el);
          else moverEls.current.delete(m.id);
        }}
        className={`mover mover-${m.kind}`}
        style={{ position: 'absolute', left: 0, top: 0, width: TILE, height: TILE, transform: `translate(${start.x - TILE / 2}px, ${start.y - TILE / 2}px)`, zIndex: m.kind === 'log' ? LAYER.goal - 2 : LAYER.robot - 1 }}
      >
        <Anchored x={TILE / 2} y={TILE / 2} size={TILE} z={0} label={m.kind === 'log' ? 'A floating log' : 'A beetle on patrol'}>
          {m.kind === 'log' ? <LogArt /> : <BeetleArt />}
        </Anchored>
        {/* Its number, matching its row in the Every tick strip, when there is more than one of its kind. */}
        {moverLabel(world, m).includes(' ') && (
          <span className={`mover-badge mover-badge-${m.kind}`} aria-hidden="true">
            {moverLabel(world, m).split(' ')[1]}
          </span>
        )}
      </div>,
    );
  }

  const boardW = world.width * TILE;
  const boardH = world.height * TILE;

  const highlights = (highlightCells ?? []).map((c) => {
    const q = toScreen(layout, c);
    return (
      <Anchored key={`h${cellKey(c)}`} x={q.x} y={q.y} size={TILE} z={LAYER.indicator} className="cell-highlight">
        <rect x={-TILE / 2 + 6} y={-TILE / 2 + 6} width={TILE - 12} height={TILE - 12} rx={16} fill="rgba(242, 194, 48, 0.25)" stroke="#f2c230" strokeWidth={5} />
      </Anchored>
    );
  });

  // The child's flags: the pending one carries the goal art inside a blue
  // ring; a right one is a green ring around the real flag; a wrong one is
  // a red ring with a cross, left on the board until the next fresh start.
  const markerEls = marks.map((m) => {
    const q = toScreen(layout, m.cell);
    const where = `column ${m.cell.x}, row ${m.cell.y}`;
    return (
      <Anchored
        key={`m${cellKey(m.cell)}-${m.state}`}
        x={q.x}
        y={q.y}
        size={TILE}
        z={LAYER.effect}
        className={`prediction-marker is-${m.state}`}
        label={m.state === 'wrong' ? `Wrong guess at ${where}` : m.state === 'right' ? `Right guess at ${where}` : `Your flag at ${where}`}
      >
        <circle cx={0} cy={0} r={40} fill="currentColor" opacity={0.14} />
        <circle cx={0} cy={0} r={40} fill="none" strokeWidth={5} strokeDasharray="12 8" />
        {m.state === 'pending' && (
          <g className="marker-flag">
            <GoalFlag theme={theme} ring={false} />
          </g>
        )}
        {m.state === 'wrong' && <path d="M-16 -16 L16 16 M16 -16 L-16 16" fill="none" strokeWidth={7} strokeLinecap="round" />}
      </Anchored>
    );
  });

  // A finger on the map: a dashed ring and a pointing hand on the tile a place slot holds, with the slot's name.
  // The robot does not move with it; off the board there is nothing to point at.
  // The bird: over the tile the bird slot holds, or, on levels that only ask it questions, perched at the top right.
  const birdOnBoard = birdCell && birdCell.x >= 0 && birdCell.y >= 0 && birdCell.x < world.width && birdCell.y < world.height;
  const birdAt = birdOnBoard ? { left: toScreen(layout, birdCell).x - 14, top: toScreen(layout, birdCell).y - 62 } : { left: layout.originX + world.width * TILE - 52, top: Math.max(0, layout.originY - 40) };
  const pointerEls = pointers
    .filter((p) => p.name !== 'bird')
    .filter((p) => p.cell.x >= 0 && p.cell.y >= 0 && p.cell.x < world.width && p.cell.y < world.height)
    .map((p) => {
      const q = toScreen(layout, p.cell);
      return (
        <Anchored key={`f${p.name}`} x={q.x} y={q.y} size={TILE} z={LAYER.effect} className="board-pointer" label={`${p.name} points at column ${p.cell.x}, row ${p.cell.y}`}>
          <rect x={-TILE / 2 + 5} y={-TILE / 2 + 5} width={TILE - 10} height={TILE - 10} rx={14} fill="rgba(124, 77, 255, 0.12)" stroke="#7c4dff" strokeWidth={4} strokeDasharray="10 7" />
          <g transform={`translate(${TILE / 2 - 30} ${TILE / 2 - 34}) scale(1.15)`}>
            <path d="M6 22v-11a3 3 0 0 1 6 0v-9a3 3 0 0 1 6 0v17c0 3-2 5-5 5h-3c-2 0-4-1-4-2z" fill="#fff" stroke="#7c4dff" strokeWidth={2.4} strokeLinejoin="round" />
          </g>
          <text x={0} y={-TILE / 2 + 22} textAnchor="middle" fontSize={16} fontWeight={800} fill="#5b2fd6">
            {p.name}
          </text>
        </Anchored>
      );
    });

  const tileButtons =
    onTileTap &&
    world.tiles.flatMap((row, y) =>
      row.map((tile, x) => {
        const q = toScreen(layout, { x, y });
        return (
          <button
            key={`t${x},${y}`}
            type="button"
            className={`tile-button ${tile === 'floor' && !plainTiles ? 'is-choice' : ''}`}
            data-cell={`${x},${y}`}
            style={{ left: q.x - TILE / 2, top: q.y - TILE / 2, width: TILE, height: TILE, zIndex: LAYER.effect + 1, animationDelay: `${(x + y) * 90}ms` }}
            aria-label={`Column ${x + 1}, row ${y + 1}${tile === 'floor' ? '' : tile === 'wall' ? ', wall' : ', water'}`}
            onClick={() => onTileTap({ x, y })}
          />
        );
      }),
    );

  return (
    <div className="board-viewport" ref={viewport} style={{ background: theme.sky }}>
      <div className="board-scaler" style={{ width: layout.stageW * scale, height: layout.stageH * scale }}>
        <div
          className="board-stage"
          role={onTileTap ? 'group' : 'img'}
          aria-label={label}
          style={{ width: layout.stageW, height: layout.stageH, transform: `scale(${scale})` }}
        >
          <svg className="board-floor" width={layout.stageW} height={layout.stageH} aria-hidden="true">
            <rect x={layout.originX + 10} y={layout.originY + 16} width={boardW} height={boardH + LIP} rx={14} fill={theme.shadow} />
            <g>{floors}</g>
            <g>{lips}</g>
            <g>{walls}</g>
            {/* Each mover's round as a dotted track, so the way it goes is on the board before it moves. */}
            <g className="mover-tracks">
              {moversOf(world).map((m) => (
                <polygon
                  key={`tr${m.id}`}
                  className={`mover-track mover-track-${m.kind}`}
                  points={m.path.map((c) => toScreen(layout, c)).map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  strokeWidth={6}
                  strokeDasharray="2 14"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </g>
          </svg>
          {Array.from({ length: robotCount }, (_, i) => (
            <div
              key={`ind${i}`}
              ref={(el) => void (elsFor(i).indicator = el ?? undefined)}
              className="forward-indicator"
              style={{ width: TILE, height: TILE, zIndex: LAYER.indicator, transformOrigin: 'center' }}
              aria-hidden="true"
            >
              <svg width={TILE} height={TILE} viewBox={`${-TILE / 2} ${-TILE / 2} ${TILE} ${TILE}`}>
                <GhostRobot />
                <polygon ref={(el) => void (elsFor(i).arrow = el ?? undefined)} points={ARROW_POINTS} />
              </svg>
            </div>
          ))}
          {highlights}
          {objects}
          {Array.from({ length: robotCount }, (_, i) => (
            <div
              key={`cue${i}`}
              ref={(el) => void (elsFor(i).turnCue = el ?? undefined)}
              className="turn-cue"
              style={{ width: CUE_BOX, height: CUE_BOX, zIndex: LAYER.effect, transformOrigin: 'center', opacity: 0 }}
              aria-hidden="true"
            >
              <svg width={CUE_BOX} height={CUE_BOX} viewBox={`${-CUE_BOX / 2} ${-CUE_BOX / 2} ${CUE_BOX} ${CUE_BOX}`} overflow="visible">
                <TurnCue />
              </svg>
            </div>
          ))}
          {Array.from({ length: robotCount }, (_, i) => (
            <div
              key={`bubble${i}`}
              ref={(el) => void (elsFor(i).bubble = el ?? undefined)}
              className="thought-bubble"
              style={{ zIndex: LAYER.effect + 1, opacity: 0 }}
              aria-hidden="true"
            />
          ))}
          {(world.team ?? []).map((_, i) => (
            <div
              key={`mate${i}`}
              ref={(el) => {
                if (el) teammateEls.current.set(i, el);
                else teammateEls.current.delete(i);
              }}
              className="robot teammate"
              data-team={i}
              data-mood="idle"
              aria-hidden="true"
              style={{ position: 'absolute', left: 0, top: 0, width: ROBOT_BOX, height: ROBOT_BOX, zIndex: LAYER.robot - 1, transformOrigin: 'center', opacity: 0 }}
            >
              <svg width={ROBOT_BOX} height={ROBOT_BOX} viewBox={`${-ROBOT_BOX / 2} ${-ROBOT_BOX / 2} ${ROBOT_BOX} ${ROBOT_BOX}`} overflow="visible">
                <Robot />
              </svg>
            </div>
          ))}
          {Array.from({ length: robotCount }, (_, i) => (
            <div
              key={`robot${i}`}
              ref={(el) => void (elsFor(i).root = el ?? undefined)}
              className="robot"
              data-mood="idle"
              aria-hidden="true"
              style={{ width: ROBOT_BOX, height: ROBOT_BOX, zIndex: LAYER.robot, transformOrigin: 'center' }}
            >
              <svg width={ROBOT_BOX} height={ROBOT_BOX} viewBox={`${-ROBOT_BOX / 2} ${-ROBOT_BOX / 2} ${ROBOT_BOX} ${ROBOT_BOX}`} overflow="visible">
                <Robot />
              </svg>
            </div>
          ))}
          {birdOnBoard && (
            <Anchored x={toScreen(layout, birdCell).x} y={toScreen(layout, birdCell).y} size={TILE} z={LAYER.effect} className="board-bird-ring" label={`The bird is over column ${birdCell.x}, row ${birdCell.y}`}>
              <rect x={-TILE / 2 + 5} y={-TILE / 2 + 5} width={TILE - 10} height={TILE - 10} rx={14} fill="rgba(226, 80, 44, 0.12)" stroke="#e2502c" strokeWidth={4} strokeDasharray="10 7" />
            </Anchored>
          )}
          {showBird && (
            <div className={`board-bird ${birdOnBoard ? 'is-flying' : ''}`} style={{ ...birdAt, zIndex: LAYER.effect + 1 }} role="img" aria-label={birdOnBoard ? 'The bird, flying over the board for the robot' : 'The bird, who can see the whole board'}>
              <div ref={(el) => void (birdEls.current.root = el ?? undefined)} className="board-bird-body">
                <BirdArt />
              </div>
              <div ref={(el) => void (birdEls.current.bubble = el ?? undefined)} className="thought-bubble board-bird-bubble" data-tone="event" aria-live="polite" />
            </div>
          )}
          {signs.map((s) => {
            const q = toScreen(layout, s.cell);
            const h = 18 + s.lines.length * 22;
            return (
              <Anchored key={`sign${s.name}`} x={q.x} y={q.y} size={TILE} z={LAYER.collectible} className="board-sign" label={`${s.name}: ${s.lines.map((l) => l.text).join(', ')}`}>
                <rect x={-5} y={-4} width={10} height={TILE / 2 + 2} rx={3} fill="#7a5b40" />
                <g transform={`translate(0 ${-TILE / 2 + 6})`}>
                  <rect x={-42} y={0} width={84} height={h} rx={8} fill="#e8c792" stroke="#8a6a4a" strokeWidth={3} />
                  {s.lines.map((l, i) => (
                    <g key={l.field}>
                      {s.focus === l.field && <rect x={-38} y={8 + i * 22} width={76} height={21} rx={5} fill="#fff4c2" stroke="#f2a330" strokeWidth={2} />}
                      <text x={0} y={24 + i * 22} textAnchor="middle" fontSize={15} fontWeight={800} fill="#4a3424">
                        {l.text}
                      </text>
                    </g>
                  ))}
                </g>
              </Anchored>
            );
          })}
          {markerEls}
          {pointerEls}
          {tileButtons}
          {coordinates && (
            <>
              {Array.from({ length: world.width }, (_, x) => (
                <span key={`cx${x}`} className="board-coord" aria-hidden="true" style={{ left: layout.originX + x * TILE, top: 0, width: TILE, height: layout.originY }}>
                  {x}
                </span>
              ))}
              {Array.from({ length: world.height }, (_, y) => (
                <span key={`cy${y}`} className="board-coord" aria-hidden="true" style={{ left: 0, top: layout.originY + y * TILE, width: layout.originX, height: TILE }}>
                  {y}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
