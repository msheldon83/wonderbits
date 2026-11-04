import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { WorldDefinition } from '../sim/types';
import { cellKey, initialState, tileAt } from '../sim/world';
import { Anchored, Collectible, FloorTile, GoalFlag, INDICATOR_BOX, Robot, ROBOT_BOX, Rock, Tree } from './art';
import { BoardController, type MotionSettings, type RobotElements } from './controller';
import { depth, LAYER, layoutFor, toScreen } from './iso';
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

  const floor: ReactElement[] = [];
  const objects: ReactElement[] = [];
  const solid = (x: number, y: number) => {
    const t = tileAt(world, { x, y });
    return t === 'floor' || t === 'wall';
  };
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const tile = world.tiles[y]![x]!;
      if (tile === 'gap') continue;
      const p = toScreen(layout, { x, y });
      floor.push(
        <g key={`f${x},${y}`} transform={`translate(${p.x} ${p.y})`}>
          <FloorTile theme={theme} x={x} y={y} showLeft={!solid(x, y + 1)} showRight={!solid(x + 1, y)} />
        </g>,
      );
      if (tile === 'wall') {
        const variant = pick(theme.wallVariants, x, y);
        objects.push(
          <Anchored key={`w${x},${y}`} x={p.x} y={p.y} w={128} above={110} below={40} z={depth({ x, y }, LAYER.wall)} className={`wall wall-${variant}`}>
            {variant === 'tree' ? <Tree theme={theme} /> : <Rock theme={theme} />}
          </Anchored>,
        );
      }
    }
  }

  const goal = toScreen(layout, world.goal);
  objects.push(
    <Anchored key="goal" x={goal.x} y={goal.y} w={160} above={130} below={16} z={depth(world.goal, LAYER.goal)} className="goal" label="Goal flag">
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
        style={{ position: 'absolute', inset: 0, zIndex: depth(c, LAYER.collectible), pointerEvents: 'none' }}
      >
        <Anchored x={p.x} y={p.y} w={48} above={40} below={12} z={0} label="Collectible">
          <Collectible theme={theme} />
        </Anchored>
      </div>,
    );
  }

  const cx = layout.originX + ((world.width - world.height) * 64) / 2;
  const cy = layout.originY + ((world.width + world.height - 2) * 32) / 2;
  const span = (world.width + world.height) * 64;

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
            <ellipse cx={cx} cy={cy + 70} rx={span * 0.42} ry={span * 0.12} fill={theme.shadow} />
            {floor}
          </svg>
          {Array.from({ length: robotCount }, (_, i) => (
            <div
              key={`ind${i}`}
              ref={(el) => void (elsFor(i).indicator = el ?? undefined)}
              className="forward-indicator"
              style={{ width: INDICATOR_BOX.w, height: INDICATOR_BOX.above + INDICATOR_BOX.below }}
              aria-hidden="true"
            >
              <svg width={INDICATOR_BOX.w} height={INDICATOR_BOX.above + INDICATOR_BOX.below} viewBox={`${-INDICATOR_BOX.w / 2} ${-INDICATOR_BOX.above} ${INDICATOR_BOX.w} ${INDICATOR_BOX.above + INDICATOR_BOX.below}`}>
                <polygon ref={(el) => void (elsFor(i).arrow = el ?? undefined)} points="" />
              </svg>
            </div>
          ))}
          {objects}
          {Array.from({ length: robotCount }, (_, i) => (
            <div
              key={`robot${i}`}
              ref={(el) => void (elsFor(i).root = el ?? undefined)}
              className="robot"
              aria-hidden="true"
              style={{ width: ROBOT_BOX.w, height: ROBOT_BOX.above + ROBOT_BOX.below, transformOrigin: `${ROBOT_BOX.w / 2}px ${ROBOT_BOX.above}px` }}
            >
              <svg width={ROBOT_BOX.w} height={ROBOT_BOX.above + ROBOT_BOX.below} viewBox={`${-ROBOT_BOX.w / 2} ${-ROBOT_BOX.above} ${ROBOT_BOX.w} ${ROBOT_BOX.above + ROBOT_BOX.below}`} overflow="visible">
                <Robot flipRef={(el) => void (elsFor(i).flip = el ?? undefined)} />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

