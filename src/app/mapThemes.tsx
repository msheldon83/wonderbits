/**
 * How each island looks on the map: its sky and ground, the landmark at the
 * top of its trail, the scenery along the way, and how the robot travels on
 * to the next island. Presentation only: the curriculum lives in the packs,
 * and an island without a theme here borrows one by its place on the map.
 *
 * Every drawing is a small flat SVG in the board's style, centred in an
 * 80 by 80 box (the landmark in 240 by 120).
 */
import type { ReactElement } from 'react';

export type TravelIcon = 'path' | 'logBridge' | 'hill' | 'ropeBridge' | 'stairs' | 'gate' | 'lift' | 'cart' | 'boat' | 'balloon' | 'wagon' | 'ferry' | 'kite' | 'flag' | 'bike';

export interface MapTheme {
  /** Top and bottom of the sky behind the island. */
  sky: [string, string];
  /** The island's ground under the trail. */
  ground: string;
  /** The dotted trail between the stones. */
  path: string;
  landmark: () => ReactElement;
  /** Scenery placed in turn down both sides of the trail. */
  decor: (() => ReactElement)[];
  /** How the robot leaves for the next island, as a verb phrase before its name: "Take the ferry to". */
  travel: { icon: TravelIcon; verb: string };
}

// ---------- Scenery ----------

const Tree = ({ c = '#4f9a5c', d = '#3d8049' }: { c?: string; d?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={36} y={50} width={8} height={22} rx={3} fill="#7a5b40" />
    <circle cx={40} cy={36} r={24} fill={c} />
    <circle cx={32} cy={30} r={10} fill={d} opacity={0.35} />
  </svg>
);
const Pine = ({ c = '#3f7f4d' }: { c?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={36} y={60} width={8} height={14} rx={2} fill="#6f5338" />
    <path d="M40 6 L62 38 H52 L66 62 H14 L28 38 H18 Z" fill={c} />
  </svg>
);
const Flowers = ({ c = '#f2c230' }: { c?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    {[
      [22, 52],
      [40, 44],
      [58, 54],
    ].map(([x, y], i) => (
      <g key={i}>
        <path d={`M${x} ${y} V${y! + 20}`} stroke="#5c9a46" strokeWidth={3} />
        <circle cx={x} cy={y} r={7} fill={c} />
        <circle cx={x} cy={y} r={2.5} fill="#fff" />
      </g>
    ))}
  </svg>
);
const Rock = ({ c = '#b5bcb8' }: { c?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M14 66 L22 40 L40 28 L60 36 L68 66 Z" fill={c} />
    <path d="M40 28 L46 50 L60 36" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={3} />
  </svg>
);
const Cloud = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M18 52 a12 12 0 0 1 4-23 a16 16 0 0 1 30-4 a12 12 0 0 1 10 27 Z" fill="#ffffff" opacity={0.9} />
  </svg>
);
const House = ({ roof = '#d6503c' }: { roof?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={18} y={38} width={44} height={32} rx={3} fill="#f3e3c8" />
    <path d="M12 40 L40 14 L68 40 Z" fill={roof} />
    <rect x={34} y={52} width={12} height={18} rx={2} fill="#7a5b40" />
  </svg>
);
const Steps = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M10 70 H70 V58 H58 V46 H46 V34 H34 V22 H22 V70" fill="#c9b49a" />
    <path d="M10 70 H70" stroke="#8a6a4a" strokeWidth={3} />
  </svg>
);
const Tower = ({ c = '#b8b0a4' }: { c?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={24} y={22} width={32} height={50} fill={c} />
    <path d="M20 22 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v6 H20 Z" fill={c} />
    <rect x={35} y={50} width={10} height={22} rx={5} fill="#5b4636" />
  </svg>
);
const Gate = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={10} y={20} width={10} height={52} rx={3} fill="#7a5b40" />
    <rect x={60} y={20} width={10} height={52} rx={3} fill="#7a5b40" />
    <rect x={20} y={34} width={40} height={8} rx={3} fill="#e9862b" />
    <rect x={20} y={52} width={40} height={8} rx={3} fill="#e9862b" />
  </svg>
);
const Column = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={28} y={14} width={24} height={8} rx={2} fill="#ddd3bd" />
    <rect x={31} y={22} width={18} height={44} fill="#e8dfcb" />
    <path d="M36 22 V66 M44 22 V66" stroke="#c9bda2" strokeWidth={2} />
    <rect x={26} y={66} width={28} height={8} rx={2} fill="#ddd3bd" />
  </svg>
);
const Plate = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <ellipse cx={40} cy={50} rx={26} ry={14} fill="#d9d2c3" stroke="#a89c86" strokeWidth={4} />
    <path d="M40 22 l6 10 h-4 l4 10" fill="none" stroke="#f2c230" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Antenna = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={22} y={44} width={36} height={28} rx={5} fill="#5d6b80" />
    <circle cx={40} cy={58} r={6} fill="#7fd1ff" />
    <path d="M40 44 V18" stroke="#5d6b80" strokeWidth={4} />
    <path d="M28 18 a14 14 0 0 1 24 0 M32 24 a8 8 0 0 1 16 0" fill="none" stroke="#7fd1ff" strokeWidth={3} strokeLinecap="round" />
  </svg>
);
const Joystick = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={16} y={50} width={48} height={20} rx={8} fill="#3b3f4a" />
    <path d="M40 50 V26" stroke="#3b3f4a" strokeWidth={6} strokeLinecap="round" />
    <circle cx={40} cy={22} r={9} fill="#d6503c" />
    <circle cx={56} cy={58} r={4} fill="#f2c230" />
  </svg>
);
const Waves = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M6 40 q9 -8 17 0 t17 0 t17 0 t17 0 M6 56 q9 -8 17 0 t17 0 t17 0 t17 0" fill="none" stroke="#a9d8ee" strokeWidth={4} strokeLinecap="round" />
  </svg>
);
const Log = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={10} y={30} width={60} height={24} rx={11} fill="#9a6a3f" />
    <ellipse cx={64} cy={42} rx={6} ry={11} fill="#c79a66" />
  </svg>
);
const Hourglass = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M24 14 H56 M24 66 H56" stroke="#7a5b40" strokeWidth={5} strokeLinecap="round" />
    <path d="M28 16 C28 34 52 34 52 40 C52 46 28 46 28 64 H52 C52 46 28 46 28 40 C28 34 52 34 52 16 Z" fill="#fff6d6" stroke="#b8701a" strokeWidth={3} />
    <path d="M33 60 H47 L40 52 Z" fill="#f2c230" />
  </svg>
);
const Book = ({ c = '#8a5cc7' }: { c?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M14 22 Q28 16 40 24 Q52 16 66 22 V62 Q52 56 40 64 Q28 56 14 62 Z" fill="#fff" stroke={c} strokeWidth={4} strokeLinejoin="round" />
    <path d="M40 24 V64" stroke={c} strokeWidth={3} />
  </svg>
);
const Abacus = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={12} y={16} width={56} height={50} rx={4} fill="none" stroke="#7a5b40" strokeWidth={5} />
    {[30, 42, 54].map((y, r) => (
      <g key={y}>
        <path d={`M14 ${y} H66`} stroke="#7a5b40" strokeWidth={2} />
        {[0, 1, 2].map((k) => (
          <circle key={k} cx={22 + k * 10 + r * 6} cy={y} r={5} fill={['#d6503c', '#3291d6', '#f2c230'][r]} />
        ))}
      </g>
    ))}
  </svg>
);
const Crate = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={16} y={24} width={48} height={44} rx={4} fill="#c79a66" stroke="#8a6a4a" strokeWidth={4} />
    <path d="M16 24 L64 68 M64 24 L16 68" stroke="#8a6a4a" strokeWidth={3} />
  </svg>
);
const Field = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    {[0, 1, 2].map((r) =>
      [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={10 + c * 21} y={14 + r * 21} width={19} height={19} rx={3} fill={(r + c) % 2 ? '#c8dc8a' : '#a3cf6b'} />),
    )}
  </svg>
);
const Tent = ({ c = '#d6503c' }: { c?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M10 68 L40 18 L70 68 Z" fill={c} />
    <path d="M40 18 L30 68 M40 18 L50 68" stroke="#fff" strokeWidth={4} opacity={0.6} />
    <path d="M40 18 V8 l10 4 -10 4" fill="#f2c230" />
  </svg>
);
const Cards = () => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <rect x={14} y={22} width={30} height={42} rx={5} fill="#fff" stroke="#3291d6" strokeWidth={3} transform="rotate(-12 29 43)" />
    <rect x={36} y={18} width={30} height={42} rx={5} fill="#fff" stroke="#d6503c" strokeWidth={3} transform="rotate(10 51 39)" />
    <text x={50} y={46} textAnchor="middle" fontSize={20} fontWeight={800} fill="#d6503c">?</text>
  </svg>
);

// ---------- Landmarks (240 by 120) ----------

const Pennant = ({ c = '#d6503c' }: { c?: string }) => (
  <svg viewBox="0 0 80 80" aria-hidden="true">
    <path d="M26 74 V12" stroke="#6f5338" strokeWidth={4} />
    <path d="M28 14 L62 24 L28 34 Z" fill={c} />
  </svg>
);
const Sun = () => <circle cx={200} cy={34} r={18} fill="#ffd95a" />;
const Hills = ({ a, b }: { a: string; b: string }) => (
  <>
    {/* The ground runs far past both edges, so a wide island never shows where the drawing ends. */}
    <path d="M-600 120 V96 Q-300 76 0 104 Q60 60 130 100 T240 90 Q540 70 840 96 V120 Z" fill={a} />
    <path d="M-600 120 V108 Q-300 92 0 114 Q90 84 170 110 T240 104 Q540 92 840 108 V120 Z" fill={b} />
  </>
);
const landmark = (children: ReactElement) => () => (
  <svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMax meet" overflow="visible" aria-hidden="true">
    {children}
  </svg>
);

const Windmill = landmark(
  <>
    <Sun />
    <Hills a="#9bd277" b="#86bf63" />
    <path d="M112 100 L118 40 H130 L136 100 Z" fill="#f3e3c8" />
    <g className="map-spin" style={{ transformOrigin: '124px 40px' }}>
      {[0, 90, 180, 270].map((a) => (
        <rect key={a} x={121} y={6} width={6} height={34} fill="#fff" stroke="#b8a68e" strokeWidth={2} transform={`rotate(${a} 124 40)`} />
      ))}
    </g>
    <circle cx={124} cy={40} r={5} fill="#7a5b40" />
  </>,
);
const Castle = landmark(
  <>
    <Hills a="#a9db86" b="#8cc46c" />
    <path d="M70 100 V50 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 V100 Z" fill="#cfc6b8" />
    <rect x={56} y={36} width={22} height={64} fill="#bdb3a4" />
    <rect x={162} y={36} width={22} height={64} fill="#bdb3a4" />
    <path d="M56 36 l11 -16 11 16 M162 36 l11 -16 11 16" fill="#d6503c" />
    <rect x={106} y={70} width={28} height={30} rx={14} fill="#5b4636" />
    <path d="M110 76 H130 M110 84 H130 M110 92 H130" stroke="#e9862b" strokeWidth={3} />
  </>,
);
const ClockTower = landmark(
  <>
    <path d="M-600 96 H0 Q60 86 120 96 T240 96 H840 V120 H-600 Z" fill="#6fb7d9" />
    <path d="M20 104 q10 -6 20 0 t20 0 M150 108 q10 -6 20 0 t20 0" stroke="#a9d8ee" strokeWidth={3} fill="none" />
    <rect x={104} y={30} width={32} height={70} fill="#d9cdb8" />
    <path d="M100 30 L120 8 L140 30 Z" fill="#8a5cc7" />
    <circle cx={120} cy={50} r={11} fill="#fff" stroke="#5b4636" strokeWidth={3} />
    <g className="map-spin-slow" style={{ transformOrigin: '120px 50px' }}>
      <path d="M120 50 V42" stroke="#5b4636" strokeWidth={3} strokeLinecap="round" />
    </g>
    <path d="M120 50 H126" stroke="#5b4636" strokeWidth={3} strokeLinecap="round" />
  </>,
);
const Lighthouse = landmark(
  <>
    <path d="M-600 98 H0 Q80 90 160 98 T240 96 H840 V120 H-600 Z" fill="#6fb7d9" />
    <path d="M150 98 L162 44 H178 L190 98 Z" fill="#fff" />
    <path d="M154 80 H186 M158 62 H182" stroke="#d6503c" strokeWidth={8} />
    <rect x={160} y={34} width={20} height={12} fill="#ffd95a" />
    <path d="M156 34 L170 22 L184 34 Z" fill="#d6503c" />
    <rect x={30} y={74} width={26} height={22} fill="#c79a66" stroke="#8a6a4a" strokeWidth={3} />
    <rect x={60} y={74} width={26} height={22} fill="#c79a66" stroke="#8a6a4a" strokeWidth={3} />
    <rect x={90} y={74} width={26} height={22} fill="#c79a66" stroke="#8a6a4a" strokeWidth={3} />
  </>,
);
const Temple = landmark(
  <>
    <Hills a="#c9d98f" b="#b5c97a" />
    <path d="M70 46 L120 18 L170 46 Z" fill="#ddd3bd" />
    {[80, 104, 128, 152].map((x) => (
      <rect key={x} x={x} y={46} width={10} height={50} fill="#e8dfcb" />
    ))}
    <rect x={66} y={96} width={108} height={8} fill="#ddd3bd" />
    <ellipse cx={120} cy={110} rx={18} ry={6} fill="#d9d2c3" stroke="#f2c230" strokeWidth={3} />
  </>,
);
const Lab = landmark(
  <>
    <path d="M-600 104 H840 V120 H-600 Z" fill="#9db0a0" />
    <rect x={70} y={50} width={100} height={54} rx={8} fill="#5d6b80" />
    {[86, 116, 146].map((x) => (
      <rect key={x} x={x} y={62} width={20} height={14} rx={3} fill="#7fd1ff" />
    ))}
    <path d="M120 50 V22" stroke="#5d6b80" strokeWidth={5} />
    <circle cx={120} cy={18} r={6} fill="#d6503c" className="map-blink" />
  </>,
);
const Library = landmark(
  <>
    <Hills a="#a3cf8b" b="#8fbd76" />
    <rect x={66} y={34} width={108} height={66} rx={6} fill="#efe3cc" />
    <path d="M60 36 L120 10 L180 36 Z" fill="#3291d6" />
    {[0, 1, 2].map((r) => (
      <g key={r}>
        <rect x={80} y={46 + r * 16} width={80} height={4} fill="#b8a68e" />
        {[0, 1, 2, 3, 4, 5, 6].map((k) => (
          <rect key={k} x={84 + k * 11} y={36 + r * 16} width={8} height={10} fill={['#d6503c', '#3291d6', '#f2c230', '#8a5cc7', '#3fae5a'][(k + r) % 5]} />
        ))}
      </g>
    ))}
  </>,
);
const Market = landmark(
  <>
    <Hills a="#b7dc8f" b="#a3cf7a" />
    {[50, 120, 190].map((x, i) => (
      <g key={x}>
        <rect x={x - 26} y={66} width={52} height={34} fill="#f3e3c8" />
        <path d={`M${x - 32} 66 L${x - 26} 46 H${x + 26} L${x + 32} 66 Z`} fill={['#d6503c', '#3291d6', '#e9862b'][i]} />
        <path d={`M${x - 32} 66 H${x + 32}`} stroke="#fff" strokeWidth={4} strokeDasharray="8 8" />
      </g>
    ))}
  </>,
);
const MapRoom = landmark(
  <>
    <Hills a="#a3cf6b" b="#8cbf55" />
    <rect x={72} y={26} width={96} height={70} rx={6} fill="#f3e3c8" stroke="#8a6a4a" strokeWidth={4} />
    {[0, 1, 2, 3].map((k) => (
      <path key={k} d={`M${72 + 24 * (k + 1)} 26 V96 M72 ${26 + 17.5 * (k + 1)} H168`} stroke="#c9b49a" strokeWidth={2} />
    ))}
    <path d="M90 82 L110 60 L130 70 L150 40" fill="none" stroke="#d6503c" strokeWidth={4} strokeDasharray="6 6" />
    <path d="M146 34 l8 8 m0 -8 l-8 8" stroke="#d6503c" strokeWidth={4} />
  </>,
);
const Carnival = landmark(
  <>
    <Hills a="#c8e29f" b="#b3d486" />
    <path d="M60 100 L100 30 L140 100 Z" fill="#d6503c" />
    <path d="M100 30 L86 100 M100 30 L114 100" stroke="#fff" strokeWidth={5} opacity={0.7} />
    <circle cx={170} cy={58} r={34} fill="none" stroke="#8a5cc7" strokeWidth={5} />
    <g className="map-spin-slow" style={{ transformOrigin: '170px 58px' }}>
      {[0, 60, 120].map((a) => (
        <path key={a} d="M136 58 H204" stroke="#8a5cc7" strokeWidth={3} transform={`rotate(${a} 170 58)`} />
      ))}
    </g>
    <path d="M150 100 L170 58 L190 100" stroke="#5b4636" strokeWidth={5} fill="none" />
  </>,
);
const Scoreboard = landmark(
  <>
    <Hills a="#a8d785" b="#93c86f" />
    <path d="M90 100 V70 M150 100 V70" stroke="#6f5338" strokeWidth={6} />
    <rect x={60} y={18} width={120} height={56} rx={6} fill="#33415c" />
    {[0, 1].map((k) => (
      <g key={k}>
        <rect x={72 + k * 56} y={30} width={40} height={34} rx={4} fill="#1f2a3d" />
        <text x={92 + k * 56} y={57} textAnchor="middle" fontSize={26} fontWeight={700} fill={k ? '#f2c230' : '#7fd0ff'}>
          {k ? 1 : 2}
        </text>
      </g>
    ))}
  </>,
);
const Meadow = landmark(
  <>
    <Sun />
    <Hills a="#9bd277" b="#86bf63" />
    <circle cx={60} cy={60} r={26} fill="#4f9a5c" />
    <rect x={56} y={80} width={8} height={20} fill="#7a5b40" />
    <circle cx={170} cy={70} r={20} fill="#6bb276" />
    <rect x={166} y={86} width={8} height={14} fill="#7a5b40" />
  </>,
);
const Pines = landmark(
  <>
    <Hills a="#86bf63" b="#6fa84f" />
    {[40, 90, 140, 190].map((x, i) => (
      <path key={x} d={`M${x} ${20 + (i % 2) * 14} L${x + 24} 96 H${x - 24} Z`} fill={i % 2 ? '#3f7f4d' : '#356b41'} />
    ))}
  </>,
);
const Cliffs = landmark(
  <>
    <path d="M-600 120 V64 H0 L40 50 L70 64 L90 120 Z" fill="#9aa39e" />
    <path d="M150 120 L170 58 L210 48 L240 60 H840 V120 Z" fill="#9aa39e" />
    <path d="M90 66 Q120 84 150 66" fill="none" stroke="#8a6a4a" strokeWidth={4} />
    {[100, 110, 120, 130, 140].map((x) => (
      <path key={x} d={`M${x} ${66 + Math.sin((x - 90) / 19) * 14} v10`} stroke="#8a6a4a" strokeWidth={3} />
    ))}
    <path d="M-600 120 H840" stroke="#6fb7d9" strokeWidth={10} />
  </>,
);
const Village = landmark(
  <>
    <Hills a="#a9db86" b="#93cb6f" />
    {[50, 100, 150, 200].map((x, i) => (
      <g key={x}>
        <rect x={x - 18} y={70 - i * 8} width={36} height={30 + i * 8} fill="#f3e3c8" />
        <path d={`M${x - 24} ${72 - i * 8} L${x} ${50 - i * 8} L${x + 24} ${72 - i * 8} Z`} fill={['#d6503c', '#e9862b', '#8a5cc7', '#3291d6'][i]} />
      </g>
    ))}
  </>,
);

// ---------- Themes ----------

const THEMES: Record<string, MapTheme> = {
  'forest-mvp': { sky: ['#e3f3ff', '#f3fbef'], ground: '#cfe9b6', path: '#8a6a4a', landmark: Meadow, decor: [() => <Tree />, () => <Flowers />, () => <Tree c="#6bb276" />], travel: { icon: 'path', verb: 'Walk the path to' } },
  'forest-trails': { sky: ['#dcefe0', '#eef6e6'], ground: '#bfdca4', path: '#7a5b40', landmark: Pines, decor: [() => <Pine />, () => <Rock />, () => <Pine c="#356b41" />], travel: { icon: 'logBridge', verb: 'Cross the log bridge to' } },
  'forest-loops': { sky: ['#fff2d9', '#f5f9e8'], ground: '#d5ebb0', path: '#8a6a4a', landmark: Windmill, decor: [() => <Flowers c="#e9862b" />, () => <Tree c="#7fbf5c" />, () => <Flowers c="#d6503c" />], travel: { icon: 'hill', verb: 'Roll down the hill to' } },
  'forest-ifs': { sky: ['#d9ecf7', '#eef3f2'], ground: '#cfd9c6', path: '#6f5338', landmark: Cliffs, decor: [() => <Rock />, () => <Cloud />, () => <Rock c="#9aa39e" />], travel: { icon: 'ropeBridge', verb: 'Take the rope bridge to' } },
  'forest-functions': { sky: ['#ffe9dc', '#fbf4e8'], ground: '#e2e9bf', path: '#8a6a4a', landmark: Village, decor: [() => <House />, () => <Steps />, () => <House roof="#3291d6" />], travel: { icon: 'stairs', verb: 'Climb the stairs to' } },
  'forest-switches': { sky: ['#e6e3f5', '#f1f1ec'], ground: '#d4e4bc', path: '#6f5338', landmark: Castle, decor: [() => <Tower />, () => <Gate />, () => <Tree c="#5f9c63" />], travel: { icon: 'gate', verb: 'Go through the castle gate to' } },
  'forest-events': { sky: ['#fbf0d0', '#f7f5e6'], ground: '#e4e5b8', path: '#8a6a4a', landmark: Temple, decor: [() => <Column />, () => <Plate />, () => <Column />], travel: { icon: 'lift', verb: 'Ride the lift to' } },
  'forest-input': { sky: ['#dde6f2', '#eef1f2'], ground: '#cad8cc', path: '#5d6b80', landmark: Lab, decor: [() => <Antenna />, () => <Joystick />, () => <Antenna />], travel: { icon: 'cart', verb: 'Drive the remote cart to' } },
  'forest-time': { sky: ['#d6ecf7', '#ecf6f6'], ground: '#bfe0d6', path: '#5b8fa8', landmark: ClockTower, decor: [() => <Waves />, () => <Log />, () => <Hourglass />], travel: { icon: 'boat', verb: 'Sail down the river to' } },
  'forest-memory': { sky: ['#e9e0f7', '#f5f2fa'], ground: '#d9e6c4', path: '#8a5cc7', landmark: Library, decor: [() => <Book />, () => <Cloud />, () => <Book c="#3291d6" />], travel: { icon: 'balloon', verb: 'Float in the balloon to' } },
  'forest-count': { sky: ['#fde8d8', '#faf4ea'], ground: '#e3eab8', path: '#b8701a', landmark: Market, decor: [() => <Abacus />, () => <Crate />, () => <Tree c="#7fbf5c" />], travel: { icon: 'wagon', verb: 'Ride the market wagon to' } },
  'forest-lists': { sky: ['#d3eaf8', '#eaf5f7'], ground: '#cfe2d8', path: '#5b8fa8', landmark: Lighthouse, decor: [() => <Crate />, () => <Waves />, () => <Crate />], travel: { icon: 'ferry', verb: 'Take the ferry to' } },
  'forest-grids': { sky: ['#e4f2dc', '#f2f7ea'], ground: '#cfe3a6', path: '#7a5b40', landmark: MapRoom, decor: [() => <Field />, () => <Tree />, () => <Field />], travel: { icon: 'kite', verb: 'Fly the kite to' } },
  'forest-shuffle': { sky: ['#fbe3ef', '#f7f3f8'], ground: '#e0e8c4', path: '#8a5cc7', landmark: Carnival, decor: [() => <Tent />, () => <Cards />, () => <Tent c="#3291d6" />], travel: { icon: 'flag', verb: 'Head on to' } },
  'forest-scoreboards': { sky: ['#e2f0fb', '#f1f7ee'], ground: '#cde6b0', path: '#b8701a', landmark: Scoreboard, decor: [() => <Pennant />, () => <Tree c="#6bb276" />, () => <Pennant c="#3291d6" />], travel: { icon: 'bike', verb: 'Ride the bike to' } },
};

const FALLBACK = Object.values(THEMES);

/** The theme for an island: its own, or one borrowed by its place on the map. */
export function mapTheme(packId: string, index: number): MapTheme {
  return THEMES[packId] ?? FALLBACK[index % FALLBACK.length]!;
}

// ---------- Ways to travel (48 by 48) ----------

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function TravelIconArt({ icon }: { icon: TravelIcon }) {
  const body: Record<TravelIcon, ReactElement> = {
    path: <path d="M10 40 C18 30 30 34 24 22 C20 14 30 8 38 8" {...s} strokeDasharray="2 6" />,
    logBridge: (
      <>
        <rect x={6} y={20} width={36} height={10} rx={5} fill="currentColor" />
        <path d="M6 36 q6 -4 12 0 t12 0 t12 0" {...s} />
      </>
    ),
    hill: (
      <>
        <path d="M4 40 Q24 8 44 40" {...s} />
        <circle cx={16} cy={20} r={5} fill="currentColor" />
      </>
    ),
    ropeBridge: (
      <>
        <path d="M4 16 Q24 30 44 16 M4 26 Q24 40 44 26" {...s} />
        <path d="M14 22 v8 M24 26 v8 M34 22 v8" {...s} />
      </>
    ),
    stairs: <path d="M6 42 H16 V32 H26 V22 H36 V12 H44" {...s} />,
    gate: (
      <>
        <path d="M8 42 V14 M40 42 V14" {...s} />
        <path d="M8 14 Q24 2 40 14" {...s} />
        <path d="M16 42 V24 M32 42 V24" {...s} />
      </>
    ),
    lift: (
      <>
        <rect x={12} y={16} width={24} height={26} rx={3} {...s} />
        <path d="M24 4 V16 M18 30 l6 -6 6 6" {...s} />
      </>
    ),
    cart: (
      <>
        <rect x={8} y={18} width={32} height={14} rx={4} {...s} />
        <circle cx={16} cy={38} r={4} fill="currentColor" />
        <circle cx={32} cy={38} r={4} fill="currentColor" />
        <path d="M24 18 V8 M18 8 q6 -6 12 0" {...s} />
      </>
    ),
    boat: (
      <>
        <path d="M6 30 H42 L36 40 H12 Z" {...s} />
        <path d="M24 30 V6 L38 26 H24" {...s} />
      </>
    ),
    balloon: (
      <>
        <circle cx={24} cy={18} r={13} {...s} />
        <path d="M14 26 L19 38 H29 L34 26 M19 38 V44 H29 V38" {...s} />
      </>
    ),
    wagon: (
      <>
        <path d="M6 20 H42 L38 34 H10 Z" {...s} />
        <circle cx={15} cy={39} r={4} fill="currentColor" />
        <circle cx={33} cy={39} r={4} fill="currentColor" />
      </>
    ),
    ferry: (
      <>
        <path d="M4 30 H44 L38 40 H10 Z" {...s} />
        <rect x={14} y={18} width={20} height={12} rx={2} {...s} />
        <path d="M24 18 V10" {...s} />
      </>
    ),
    kite: (
      <>
        <path d="M24 4 L36 18 L24 32 L12 18 Z" {...s} />
        <path d="M24 32 Q20 38 26 42 T24 46" {...s} />
      </>
    ),
    bike: (
      <>
        <circle cx={12} cy={32} r={8} {...s} />
        <circle cx={36} cy={32} r={8} {...s} />
        <path d="M12 32 L20 18 H32 L36 32 M20 18 L26 32 H12 M30 12 H36" {...s} />
      </>
    ),
    flag: (
      <>
        <path d="M12 44 V6" {...s} />
        <path d="M12 8 H36 L30 16 L36 24 H12" {...s} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      {body[icon]}
    </svg>
  );
}
