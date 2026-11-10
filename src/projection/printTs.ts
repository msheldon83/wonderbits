/**
 * TypeScript projection: a pure, deterministic printer from the IR to
 * readable TypeScript. Read-only through Phase 3; Phase 4 adds a parser that
 * lifts hand-edited code back into the IR using the @node comments.
 */
import { isSenseId, MAIN, parseLength, parseRandom, parseRead, parseSlotTest, type CommandId, type ConditionId, type IRNode, type MemorySlot, type ProgramIR, type SenseId, type Source, type Value } from '../ir/types';

const CALL: Record<CommandId, string> = {
  forward: 'robot.forward();',
  rotateCW: 'robot.rotateClockwise();',
  rotateCCW: 'robot.rotateCounterClockwise();',
  wait: 'robot.wait();',
};

export const SENSE: Record<SenseId, string> = {
  pathAhead: 'robot.pathAhead()',
  blockedAhead: 'robot.blockedAhead()',
  acornAhead: 'robot.acornAhead()',
  atFlag: 'robot.atFlag()',
  gateClosedAhead: 'robot.gateClosedAhead()',
  onSwitch: 'robot.onSwitch()',
};

const INDENT = '  ';
const DIRECTION: Record<string, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };

/** A value as TypeScript: 3, true, 'right', { x: 2, y: 1 }, [true, false]. */
export function valueCode(v: Value): string {
  if (Array.isArray(v)) return `[${v.map(valueCode).join(', ')}]`;
  if (typeof v === 'object') return `{ x: ${v.x}, y: ${v.y} }`;
  if (typeof v === 'string') return `'${DIRECTION[v] ?? v}'`;
  return String(v);
}

const TYPE: Record<string, string> = { number: 'number', yesNo: 'boolean', direction: 'Direction', position: 'Position' };
const typeCode = (m: MemorySlot) => (m.kind === 'list' ? `${TYPE[m.of ?? 'number']}[]` : m.kind === 'grid' ? `${TYPE[m.of ?? 'number']}[][]` : TYPE[m.kind]!);

/** A slot's start: a value, or a copy of the board's map. */
function startCode(start: Value): string {
  if (typeof start === 'string' && start.startsWith('board:')) return `robot.map('${start.slice(6)}')`;
  return valueCode(start);
}

/** A grid place as TypeScript: the robot's position, the tile ahead, or a position variable. */
function placeCode(at: string): string {
  return at === 'here' ? 'robot.position()' : at === 'ahead' ? 'robot.ahead()' : at;
}

/** What a Set card reads, as TypeScript. */
function sourceCode(source: Source): string {
  if (typeof source !== 'string') return String(source);
  const read = parseRead(source);
  if (read) return `at(${read.grid}, ${placeCode(read.at)})`;
  const counted = parseLength(source);
  if (counted) return `${counted}.length`;
  const random = parseRandom(source);
  if (random?.kind === 'range') return `random(${random.low}, ${random.high})`;
  if (random?.kind === 'coin') return 'coinFlip()';
  if (random?.kind === 'way') return 'randomDirection()';
  if (random?.kind === 'pick') return `pick(${random.list})`;
  if (source === 'facing') return 'robot.facing()';
  if (source === 'here') return 'robot.position()';
  if (source === 'acorns') return 'robot.acorns()';
  if (isSenseId(source)) return SENSE[source];
  return valueCode(source);
}

/** A check as TypeScript: a sense call, or a comparison with a memory slot. */
export function conditionCode(c: ConditionId): string {
  if (isSenseId(c)) return SENSE[c];
  const t = parseSlotTest(c)!;
  if (t.value === 'yes') return t.slot;
  if (t.value === 'no') return `!${t.slot}`;
  if (t.value === 'here') return `robot.isAt(${t.slot})`;
  if (/^\d+$/.test(t.value)) return `${t.slot} === ${t.value}`;
  return `${t.slot} === '${DIRECTION[t.value] ?? t.value}'`;
}

/** The types a program's memory needs from the robot's library, beside the robot itself. */
function typeImports(program: ProgramIR): string {
  const kinds = new Set((program.memory ?? []).map((m) => (m.kind === 'list' || m.kind === 'grid' ? m.of : m.kind)));
  const types = [...(kinds.has('direction') ? ['Direction'] : []), ...(kinds.has('position') ? ['Position'] : [])];
  // Grids are read with at() and written with put(), which count rows and columns from the top left.
  const grids = (program.memory ?? []).some((m) => m.kind === 'grid') ? ['at', 'put'] : [];
  // Random sources come from the library too: random(), coinFlip(), randomDirection(), pick().
  const used = new Set<string>();
  const visit = (nodes: readonly IRNode[]): void => {
    for (const n of nodes) {
      const source = n.kind === 'set' || n.kind === 'push' ? n.to : undefined;
      const r = source === undefined ? null : parseRandom(source);
      if (r) used.add(r.kind === 'range' ? 'random' : r.kind === 'coin' ? 'coinFlip' : r.kind === 'way' ? 'randomDirection' : 'pick');
      if ('body' in n) visit(n.body);
      if (n.kind === 'ifElse') visit(n.elseBody);
    }
  };
  for (const p of program.procedures) visit(p.body);
  for (const h of program.handlers) visit(h.body);
  const randoms = ['random', 'coinFlip', 'randomDirection', 'pick'].filter((r) => used.has(r));
  return [...grids, ...randoms].map((g) => `, ${g}`).concat(types.map((t) => `, type ${t}`)).join('');
}

/** A negated check, written the way a person would. */
function notCode(c: ConditionId): string {
  const code = conditionCode(c);
  if (code.startsWith('!')) return code.slice(1);
  if (code.includes(' === ')) return code.replace(' === ', ' !== ');
  return /^[\w.()]+$/.test(code) ? `!${code}` : `!(${code})`;
}

function printBody(nodes: readonly IRNode[], depth: number, lines: string[]): void {
  if (nodes.length === 0) lines.push(`${INDENT.repeat(depth)}// Nothing inside yet.`);
  for (const node of nodes) printNode(node, depth, lines);
}

function printNode(node: IRNode, depth: number, lines: string[]): void {
  const pad = INDENT.repeat(depth);
  const tag = `// @node ${node.id}`;
  switch (node.kind) {
    case 'repeat':
      lines.push(`${pad}for (let i = 0; i < ${node.count}; i++) { ${tag}`);
      printBody(node.body, depth + 1, lines);
      lines.push(`${pad}}`);
      return;
    case 'if':
      lines.push(`${pad}if (${conditionCode(node.condition)}) { ${tag}`);
      printBody(node.body, depth + 1, lines);
      lines.push(`${pad}}`);
      return;
    case 'ifElse':
      lines.push(`${pad}if (${conditionCode(node.condition)}) { ${tag}`);
      printBody(node.body, depth + 1, lines);
      lines.push(`${pad}} else {`);
      printBody(node.elseBody, depth + 1, lines);
      lines.push(`${pad}}`);
      return;
    case 'until':
      lines.push(`${pad}while (${notCode(node.condition)}) { ${tag}`);
      printBody(node.body, depth + 1, lines);
      lines.push(`${pad}}`);
      return;
    case 'call':
      lines.push(`${pad}${node.name}(); ${tag}`);
      return;
    case 'forEach':
      lines.push(`${pad}for (${node.item} of ${node.list}) { ${tag}`);
      printBody(node.body, depth + 1, lines);
      lines.push(`${pad}}`);
      return;
    case 'set':
      lines.push(`${pad}${node.slot} = ${sourceCode(node.to)}; ${tag}`);
      return;
    case 'change':
      lines.push(`${pad}${node.slot} ${node.by < 0 ? '-=' : '+='} ${Math.abs(node.by)}; ${tag}`);
      return;
    case 'face':
      lines.push(`${pad}robot.face(${node.slot}); ${tag}`);
      return;
    case 'unlock':
      lines.push(`${pad}robot.unlock('${node.gate}', ${node.slot}); ${tag}`);
      return;
    case 'push':
      lines.push(`${pad}${node.list}.push(${sourceCode(node.to)}); ${tag}`);
      return;
    case 'goRow':
      lines.push(`${pad}robot.goToRow(${node.to}); ${tag}`);
      return;
    case 'goColumn':
      lines.push(`${pad}robot.goToColumn(${node.to}); ${tag}`);
      return;
    case 'shift': {
      const [axis, sign] = ({ N: ['y', '-'], S: ['y', '+'], E: ['x', '+'], W: ['x', '-'] } as const)[node.dir];
      lines.push(`${pad}${node.slot}.${axis} ${sign}= 1; ${tag}`);
      return;
    }
    case 'mark':
      lines.push(`${pad}put(${node.grid}, ${placeCode(node.at)}, ${node.slot}); ${tag}`);
      return;
    case 'openGate':
      lines.push(`${pad}robot.openGate('${node.gate}'); ${tag}`);
      return;
    case 'closeGate':
      lines.push(`${pad}robot.closeGate('${node.gate}'); ${tag}`);
      return;
    default:
      lines.push(`${pad}${CALL[node.kind as CommandId]} ${tag}`);
  }
}

/** 'stepOn:1' prints as 'steppedOn', 1; 'key:up' as 'keyPressed', 'up'; 'acorn' and 'tick' as themselves. */
function eventArgs(event: string): string {
  const [kind, arg] = event.split(':');
  if (kind === 'stepOn') return `'steppedOn', ${arg}`;
  if (kind === 'key') return `'keyPressed', '${arg}'`;
  if (kind === 'acorn') return `'acornPicked'`;
  return `'${kind}'`;
}

export function printProgram(program: ProgramIR): string {
  const lines: string[] = [
    `// Generated by Wonderbits from program IR v${program.version}. Read-only.`,
    `import { robot${typeImports(program)} } from 'wonderbits';`,
  ];
  // The robot's memory: one typed variable per slot, before anything uses it.
  if (program.memory?.length) {
    lines.push('');
    for (const m of program.memory) lines.push(`let ${m.name}: ${typeCode(m)} = ${startCode(m.start)};`);
  }
  // Main is the program the robot runs; each function is a helper beside it.
  for (const proc of program.procedures) {
    lines.push('', `${proc.name === MAIN ? 'export ' : ''}function ${proc.name}(): void {`);
    if (proc.body.length === 0) lines.push(`${INDENT}// No steps yet.`);
    for (const node of proc.body) printNode(node, 1, lines);
    lines.push('}');
  }
  // Each When card prints as a handler: the event as the robot names it, and its cards inside.
  for (const handler of program.handlers) {
    lines.push('', `robot.on(${eventArgs(handler.event)}, () => { // @node on:${handler.event}`);
    if (handler.body.length === 0) lines.push(`${INDENT}// No steps yet.`);
    for (const node of handler.body) printNode(node, 1, lines);
    lines.push('});');
  }
  return lines.join('\n') + '\n';
}

/** Map each printed line back to the node it came from, for highlighting. */
export function lineNodeIds(source: string): (string | null)[] {
  return source.split('\n').map((line) => /\/\/ @node (\S+)$/.exec(line)?.[1] ?? null);
}
