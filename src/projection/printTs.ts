/**
 * TypeScript projection: a pure, deterministic printer from the IR to
 * readable TypeScript. Read-only through Phase 3; Phase 4 adds a parser that
 * lifts hand-edited code back into the IR using the @node comments.
 */
import { isPosition, isSenseId, MAIN, parseField, parseItem, parseLength, parseRandom, parseRead, parseSlotTest, type CommandId, type ConditionId, type IRNode, type MemorySlot, type ProgramIR, type SenseId, type Source, type Value } from '../ir/types';
import type { Teammate } from '../sim/types';

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
  if (isPosition(v)) return `{ x: ${v.x}, y: ${v.y} }`;
  if (typeof v === 'object') return `{ ${Object.entries(v).map(([f, x]) => `${f}: ${valueCode(x)}`).join(', ')} }`;
  if (typeof v === 'string') return `'${DIRECTION[v] ?? v}'`;
  return String(v);
}

const TYPE: Record<string, string> = { number: 'number', yesNo: 'boolean', direction: 'Direction', position: 'Position' };
function typeCode(m: MemorySlot): string {
  if (m.kind === 'record') return m.shape ?? 'object';
  if (m.kind === 'list') return `${m.of === 'record' ? (m.shape ?? 'object') : TYPE[m.of ?? 'number']}[]`;
  if (m.kind === 'grid') return `${TYPE[m.of ?? 'number']}[][]`;
  return TYPE[m.kind]!;
}

/** Each record shape the memory uses, once, as an interface: its fields and their types. */
function shapeCode(memory: readonly MemorySlot[]): string[] {
  const seen = new Map<string, MemorySlot>();
  for (const m of memory) if (m.shape && m.fields && !seen.has(m.shape)) seen.set(m.shape, m);
  return [...seen.values()].flatMap((m) => ['', `interface ${m.shape} {`, ...Object.entries(m.fields!).map(([f, k]) => `${INDENT}${f}: ${TYPE[k]};`), '}']);
}

/** A slot's start: a value, or a copy of the board's map. */
function startCode(start: Value): string {
  if (typeof start === 'string' && start.startsWith('board:')) return `robot.map('${start.slice(6)}')`;
  return valueCode(start);
}

/** A grid place as TypeScript: the robot's position, the tile ahead, or a position variable. */
function placeCode(at: string): string {
  return at === 'here' ? 'robot.position()' : at === 'ahead' ? 'robot.ahead()' : at;
}

/** A grid's tile as TypeScript: a list of rows, so row first, both counted from 0. */
function cellCode(grid: string, at: string): string {
  const place = placeCode(at);
  return `${grid}[${place}.y][${place}.x]`;
}

/** What a Set card reads, as TypeScript. */
function sourceCode(source: Source): string {
  if (typeof source !== 'string') return String(source);
  const field = parseField(source);
  if (field) return `${field.record}.${field.field}`;
  const read = parseRead(source);
  if (read) return cellCode(read.grid, read.at);
  const item = parseItem(source);
  if (item) return `${item.list}[${item.index}]`;
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
  if (source === 'acornsLeft') return 'robot.acornsLeft()';
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
  const kinds = new Set<string | undefined>((program.memory ?? []).flatMap((m) => [m.kind === 'list' || m.kind === 'grid' ? m.of : m.kind, ...Object.values(m.fields ?? {})]));
  const types = [...(kinds.has('direction') ? ['Direction'] : []), ...(kinds.has('position') ? ['Position'] : [])];
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
  const backpack = (program.memory ?? []).some((m) => m.keep) ? [', backpack'] : [];
  return backpack.concat(randoms.map((g) => `, ${g}`)).concat(types.map((t) => `, type ${t}`)).join('');
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
      lines.push(`${pad}${cellCode(node.grid, node.at)} = ${node.slot}; ${tag}`);
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

export interface PrintOptions {
  /** A team board: the program prints as a blueprint class, and the robots as instances of it. */
  team?: readonly Teammate[];
}

/** A line of a method: the robot is `this`, and so are its memory and its functions. The node tag is kept as it is. */
function thisify(line: string, slots: readonly string[], functions: readonly string[]): string {
  const at = line.indexOf(' // @node');
  let code = at < 0 ? line : line.slice(0, at);
  const tag = at < 0 ? '' : line.slice(at);
  code = code.replace(/\brobot\./g, 'this.');
  for (const f of functions) code = code.replace(new RegExp(`(?<![\\w.'])${f}\\(\\)`, 'g'), `this.${f}()`);
  for (const s of slots) code = code.replace(new RegExp(`(?<![\\w.'])${s}\\b(?!\\s*:)(?!')`, 'g'), `this.${s}`);
  return code + tag;
}

/**
 * A team board: the program is a blueprint, so it prints as a class. Each
 * slot is a field, so every robot built from it has its own; main and the
 * functions are methods. The robots are instances, each built at its own
 * start, with its own values where the level gives them.
 */
function printTeam(program: ProgramIR, team: readonly Teammate[]): string {
  const memory = program.memory ?? [];
  const slots = memory.map((m) => m.name);
  const functions = program.procedures.filter((p) => p.name !== MAIN).map((p) => p.name);
  const lines: string[] = [`// Generated by Wonderbits from program IR v${program.version}. Read-only.`, `import { Robot${typeImports(program)} } from 'wonderbits';`];
  lines.push(...shapeCode(memory));
  lines.push('', '// The blueprint: every robot built from it runs the same cards, with its own memory.', 'class Bot extends Robot {');
  for (const m of memory) lines.push(`${INDENT}${m.name}: ${typeCode(m)} = ${startCode(m.start)};`);
  for (const proc of program.procedures) {
    lines.push(...(memory.length > 0 || proc !== program.procedures[0] ? [''] : []), `${INDENT}${proc.name}(): void {`);
    const body: string[] = [];
    if (proc.body.length === 0) body.push(`${INDENT.repeat(2)}// No steps yet.`);
    for (const node of proc.body) printNode(node, 2, body);
    lines.push(...body.map((l) => thisify(l, slots, functions)), `${INDENT}}`);
  }
  lines.push('}', '', '// The team: robots built from the blueprint, each at its own start.', 'const team = [');
  for (const t of team) {
    const make = `new Bot(${t.robot.x}, ${t.robot.y}, ${valueCode(t.robot.facing)})`;
    const own = Object.entries(t.memory ?? {});
    lines.push(`${INDENT}${own.length > 0 ? `Object.assign(${make}, { ${own.map(([k, v]) => `${k}: ${valueCode(v)}`).join(', ')} })` : make},`);
  }
  lines.push('];', 'for (const bot of team) bot.main();');
  return lines.join('\n') + '\n';
}

export function printProgram(program: ProgramIR, options: PrintOptions = {}): string {
  if (options.team) return printTeam(program, options.team);
  const lines: string[] = [
    `// Generated by Wonderbits from program IR v${program.version}. Read-only.`,
    `import { robot${typeImports(program)} } from 'wonderbits';`,
  ];
  // The robot's memory: one typed variable per slot, before anything uses it.
  // A slot in the backpack starts from what was saved last night, or its start on the first day.
  if (program.memory?.length) {
    lines.push(...shapeCode(program.memory));
    lines.push('');
    for (const m of program.memory) lines.push(m.keep ? `let ${m.name}: ${typeCode(m)} = backpack.load('${m.name}', ${startCode(m.start)});` : `let ${m.name}: ${typeCode(m)} = ${startCode(m.start)};`);
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
  // At night the backpack's slots are saved for tomorrow; everything else is forgotten.
  const kept = (program.memory ?? []).filter((m) => m.keep);
  if (kept.length > 0) {
    lines.push('', `robot.on('night', () => { // @node night`);
    for (const m of kept) lines.push(`${INDENT}backpack.save('${m.name}', ${m.name});`);
    lines.push('});');
  }
  return lines.join('\n') + '\n';
}

/** Map each printed line back to the node it came from, for highlighting. */
export function lineNodeIds(source: string): (string | null)[] {
  return source.split('\n').map((line) => /\/\/ @node (\S+)$/.exec(line)?.[1] ?? null);
}
