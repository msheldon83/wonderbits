import { describe, expect, it, vi } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import type { NodeSpec } from '../ir/spec';
import { searchFlat } from '../lessons/validate';
import { memoryStore } from '../progress/storage';
import { createRuntimeClient, type Endpoint } from '../runtime/client';
import type { Critique, CritiqueRequest, RuntimeMessage } from '../runtime/contract';
import type { WorldDefinition } from '../sim/types';
import { hashFor, parseRoute } from '../app/levels';
import { blankCreation, blankWorld, FREE_PLAY_CARDS } from './blank';
import { criticWords, critique, fitsRules } from './critic';
import { goalWords, playKeyOf } from './PlayScreen';
import { CreationStore } from './store';
import { applyTool } from './worldOps';

const ir = (spec: NodeSpec[]) => programFromSpec(spec, sequentialIdFactory());
const goal = { reachGoal: true, collectAll: false };
const steps = ['forward', 'rotateCW', 'rotateCCW'] as const;
const ask = (world: WorldDefinition, program: NodeSpec[], rules: Partial<CritiqueRequest['rules']> = {}, objective = goal) =>
  critique({ world, objective, rules: { allowedCommands: [...FREE_PLAY_CARDS], random: false, ...rules }, program: ir(program), searchMillis: 2000 });
const four: NodeSpec[] = ['forward', 'forward', 'forward', 'forward'];
/** The flag shut in behind rocks. */
const walled = [[3, 1], [3, 2], [3, 3], [4, 1], [4, 3]].reduce((w, [x, y]) => applyTool(w, 'wall', { x: x!, y: y! }), blankWorld());

describe('fitsRules', () => {
  it('holds a program to the puzzle\'s cards, senses and limit', () => {
    const rules = { allowedCommands: [...steps, 'repeat', 'if'] as CritiqueRequest['rules']['allowedCommands'], allowedConditions: ['pathAhead'] as CritiqueRequest['rules']['allowedConditions'] & object, maxInstructions: 4 };
    expect(fitsRules(rules, ir(four))).toBe(true);
    expect(fitsRules(rules, ir([...four, 'forward']))).toBe(false);
    expect(fitsRules(rules, ir([{ repeat: 4, do: ['forward'] }]))).toBe(true);
    expect(fitsRules(rules, ir([{ until: 'atFlag', do: ['forward'] }]))).toBe(false);
    expect(fitsRules(rules, ir([{ if: 'blockedAhead', do: ['forward'] }]))).toBe(false);
    expect(fitsRules(rules, ir([{ if: 'pathAhead', do: ['forward'] }]))).toBe(true);
  });
});

describe('the critic', () => {
  it('finds the shortest plain way and checks the maker\'s own program', () => {
    expect(ask(blankWorld(), four)).toEqual({ own: { fits: true, solves: true, steps: 4 }, flat: { kind: 'found', steps: 4 } });
    expect(ask(blankWorld(), ['forward']).own).toEqual({ fits: true, solves: false, steps: 1 });
    expect(ask(blankWorld(), [{ repeat: 4, do: ['forward'] }], { maxInstructions: 2 }).own).toEqual({ fits: true, solves: true, steps: 2 });
    expect(ask(blankWorld(), four, { maxInstructions: 3 }).own.fits).toBe(false);
  });

  it('is certain a walled-off flag cannot be reached with plain steps', () => {
    expect(ask(walled, four).flat).toEqual({ kind: 'impossible' });
  });

  it('does not claim certainty when a card could change the board', () => {
    const gated = applyTool(blankWorld(1 + 4, 1), 'gate', { x: 2, y: 0 });
    expect(ask(gated, four, { allowedCommands: [...steps] }).flat).toEqual({ kind: 'impossible' });
    expect(ask(gated, four, { allowedCommands: [...steps, 'openGate'] }).flat).toEqual({ kind: 'unknown' });
  });

  it('checks the goal the maker chose', () => {
    const acorn = applyTool(blankWorld(), 'acorn', { x: 2, y: 2 });
    const collect = { reachGoal: false, collectAll: true };
    expect(ask(acorn, ['forward', 'forward'], {}, collect)).toEqual({ own: { fits: true, solves: true, steps: 2 }, flat: { kind: 'found', steps: 2 } });
  });

  it('survives a program the interpreter cannot run', () => {
    expect(ask(blankWorld(), [{ call: 'nowhere' }]).own.solves).toBe(false);
  });

  it('stops searching at its deadline and says it does not know', () => {
    const big = [[14, 14], [14, 15], [15, 14]].reduce((w, [x, y]) => applyTool(w, 'wall', { x: x!, y: y! }), { ...blankWorld(16, 16), goal: { x: 15, y: 15 } });
    expect(searchFlat({ world: big, objective: goal, programming: { allowedCommands: [...steps] } }, 64, Date.now() - 1)).toEqual({ kind: 'timeout' });
    expect(searchFlat({ world: big, objective: goal, programming: { allowedCommands: [...steps] } }, 64)).toEqual({ kind: 'none' });
    expect(searchFlat({ world: blankWorld(16, 16), objective: goal, programming: { allowedCommands: [...steps] } }, 5)).toEqual({ kind: 'cap' });
    expect(critique({ world: big, objective: goal, rules: { allowedCommands: [...steps], random: false }, program: ir([]), searchMillis: -1 }).flat).toEqual({ kind: 'unknown' });
  });
});

describe('the critic\'s words', () => {
  const rules = { allowedCommands: [...FREE_PLAY_CARDS] };
  const plain = { allowedCommands: [...steps] };
  const own = { fits: true, solves: true, steps: 4 };
  const words = (c: Critique, r: Parameters<typeof criticWords>[1]) => criticWords(c, r).map((l) => `${l.tone}: ${l.text}`);

  it('says the puzzle is ready once its maker solved it, and how short it can be', () => {
    expect(words({ own, flat: { kind: 'found', steps: 4 } }, { ...plain, maxInstructions: 6 })).toEqual(['good: You solved it yourself in 4 cards. Others can play it now.', 'note: The shortest way with plain steps takes 4 cards. Your puzzle allows 6.']);
  });

  it('says when a flat program sneaks under the limit, and when Repeat is needed', () => {
    expect(words({ own, flat: { kind: 'found', steps: 4 } }, rules)[2]).toBe('note: A player can solve it without Repeat.');
    expect(words({ own, flat: { kind: 'found', steps: 9 } }, { ...rules, maxInstructions: 5 })[2]).toBe('note: So a player needs Repeat to fit under 5.');
  });

  it('says when nobody can solve it', () => {
    expect(words({ own: { fits: true, solves: false, steps: 1 }, flat: { kind: 'impossible' } }, plain)).toEqual([
      'note: You have not solved it yourself yet. Press Play and solve it. Then others can play it.',
      'problem: Nobody can solve this with these cards. I tried every way the robot can go.',
    ]);
    expect(words({ own: { fits: true, solves: false, steps: 0 }, flat: { kind: 'found', steps: 8 } }, { ...plain, maxInstructions: 5 })[2]).toBe('problem: Nobody can solve this: no way through is shorter than 8 cards.');
  });

  it('says what it could not check, and when the maker\'s program breaks the puzzle\'s own rules', () => {
    expect(words({ own, flat: { kind: 'unknown' } }, plain)[1]).toMatch(/too big for me/);
    expect(words({ own: { fits: false, solves: true, steps: 7 }, flat: { kind: 'unknown' } }, { ...plain, maxInstructions: 5 })[0]).toBe('problem: Your own program has 7 cards. Your puzzle allows 5.');
    expect(words({ own: { fits: false, solves: true, steps: 1 }, flat: { kind: 'unknown' } }, plain)[0]).toMatch(/uses a card your puzzle does not give/);
  });
});

describe('proof', () => {
  it('is kept through a new name or program, and dropped when the puzzle changes', async () => {
    let t = 1;
    const store = new CreationStore(memoryStore(), () => t++, () => 'c-1');
    await store.load();
    const c = store.add(blankCreation('Maze'));
    expect(store.prove(c.id, four, 4)).toMatchObject({ status: 'proved', proof: { solution: four, steps: 4, provedAt: 2 } });
    // The same proof again changes nothing.
    expect(store.prove(c.id, four, 4)?.proof?.provedAt).toBe(2);
    expect(store.update(c.id, { title: 'Big maze', program: ['forward'] })?.status).toBe('proved');
    // Saving the same board is no change.
    expect(store.update(c.id, { world: structuredClone(c.world) })?.status).toBe('proved');
    const limited = store.update(c.id, { programming: { ...c.programming, maxInstructions: 3 } })!;
    expect(limited.status).toBe('draft');
    expect(limited).not.toHaveProperty('proof');
    store.prove(c.id, four, 4);
    expect(store.update(c.id, { world: applyTool(c.world, 'wall', { x: 2, y: 2 }) })?.status).toBe('draft');
    store.prove(c.id, four, 4);
    expect(store.update(c.id, { objective: { reachGoal: true, collectAll: true } })?.status).toBe('draft');

    const again = new CreationStore(memoryStore());
    expect(again.prove('gone', four, 4)).toBeUndefined();
  });

  it('gives a newly proved puzzle fresh stars', () => {
    const c = { ...blankCreation('Maze'), schemaVersion: 1 as const, id: 'c-1', createdAt: 1, updatedAt: 1 };
    expect(playKeyOf({ ...c, proof: { solution: four, steps: 4, provedAt: 7 } })).toBe('made:c-1:7');
    expect(playKeyOf({ ...c, proof: { solution: four, steps: 4, provedAt: 9 } })).toBe('made:c-1:9');
    expect(goalWords(c)).toBe('Help the robot reach the flag.');
    expect(goalWords({ objective: { reachGoal: true, collectAll: true } })).toMatch(/every acorn, then/);
    expect(parseRoute('#/play/c-1')).toEqual({ screen: 'play', id: 'c-1' });
    expect(hashFor({ screen: 'play', id: 'c-1' })).toBe('#/play/c-1');
  });
});

describe('the critic behind the runtime contract', () => {
  /** An endpoint that answers a critique as the Worker does, or never answers. */
  const endpoint = (answers: boolean) => {
    const made: (Endpoint & { terminated: boolean })[] = [];
    const create = () => {
      const listeners = new Set<(e: MessageEvent<RuntimeMessage>) => void>();
      const ep: Endpoint & { terminated: boolean } = {
        terminated: false,
        postMessage(m) {
          if (answers && m.type === 'critique') queueMicrotask(() => listeners.forEach((l) => l({ data: { type: 'critique', requestId: m.requestId, critique: critique(m) } } as MessageEvent<RuntimeMessage>)));
        },
        addEventListener: (_t, l) => listeners.add(l),
        removeEventListener: (_t, l) => listeners.delete(l),
        terminate() {
          this.terminated = true;
        },
      };
      made.push(ep);
      return ep;
    };
    return { create, made };
  };
  const input = { world: blankWorld(), objective: goal, rules: { allowedCommands: [...FREE_PLAY_CARDS], random: false }, program: ir(four), searchMillis: 50 };

  it('answers on an endpoint of its own, and closes it', async () => {
    const { create, made } = endpoint(true);
    const client = createRuntimeClient(create);
    expect(await client.critique(input)).toEqual({ own: { fits: true, solves: true, steps: 4 }, flat: { kind: 'found', steps: 4 } });
    expect(made).toHaveLength(1);
    expect(made[0]!.terminated).toBe(true);
  });

  it('gives up on a critic that never answers', async () => {
    vi.useFakeTimers();
    const { create, made } = endpoint(false);
    const client = createRuntimeClient(create);
    const answer = client.critique(input);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await answer).toBeNull();
    expect(made[0]!.terminated).toBe(true);
    vi.useRealTimers();
  });
});
