import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { WorldDefinition } from '../sim/types';
import { cellKey, initialState, tileAt } from '../sim/world';
import { Anchored, ARROW_POINTS, Collectible, FloorTile, GoalFlag, Lip, Robot, ROBOT_BOX, Rock, Tree, Water } from './art';
import { BoardController, type MotionSettings, type RobotElements } from './controller';
import { LAYER, LIP, layoutFor, TILE, toScreen } from './grid';
import { pick, type Theme } from './themes';

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
}

export function Board({ world, theme, motion, label, onControllers, robotCount = 1, maxScale = 1.6 }: BoardProps) {
  const layout = useMemo(() => layoutFor(world), [world]);
  const viewport = useRef<HTMLDivElement>(null);
  const robotEls = useRef<Partial<RobotElements>[]>([]);
  const gems = useRef(new Map<string, HTMLElement>());
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
      const c = new BoardController(world, layout, els, i === 0 ? gems.current : new Map(), theme.indicator, motion);
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
  }, [world, layout, theme, onControllers, robotCount]);

  useEffect(() => {
    for (const c of controllers.current) c.motion = motion;
  }, [motion]);

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
  objects.push(
    <Anchored key="goal" x={goal.x} y={goal.y} size={TILE} z={LAYER.goal} className="goal" label="Goal flag">
      <GoalFlag theme={theme} />
    </Anchored>,
  );
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

  const boardW = world.width * TILE;
  const boardH = world.height * TILE;

  return (
    <div className="board-viewport" ref={viewport} style={{ background: theme.sky }}>
      <div className="board-scaler" style={{ width: layout.stageW * scale, height: layout.stageH * scale }}>
        <div
          className="board-stage"
          role="img"
          aria-label={label}
          style={{ width: layout.stageW, height: layout.stageH, transform: `scale(${scale})` }}
        >
          <svg className="board-floor" width={layout.stageW} height={layout.stageH} aria-hidden="true">
            <rect x={layout.originX + 10} y={layout.originY + 16} width={boardW} height={boardH + LIP} rx={14} fill={theme.shadow} />
            <g>{floors}</g>
            <g>{lips}</g>
            <g>{walls}</g>
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
                <polygon ref={(el) => void (elsFor(i).arrow = el ?? undefined)} points={ARROW_POINTS} />
              </svg>
            </div>
          ))}
          {objects}
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
        </div>
      </div>
    </div>
  );
}
