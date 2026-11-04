/**
 * Program editor. The interaction model is "tap a card, tap a slot":
 * tap a card in the palette or in the program and it lifts; the valid slots
 * open; tap a slot to place it. Tap the card again, or press Escape, to cancel.
 * Every action is a native button, so keyboard and screen readers work too.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { IdFactory } from '../ir/ids';
import { isNoOpMove, type EditOp } from '../ir/ops';
import { countNodes, mainBody } from '../ir/program';
import type { CommandId, NodeId, ProgramIR } from '../ir/types';
import { COMMANDS } from './commands';

export type Selection = null | { from: 'palette'; command: CommandId } | { from: 'program'; id: NodeId };

export interface EditorProps {
  program: ProgramIR;
  allowedCommands: CommandId[];
  maxInstructions?: number;
  /** True while a run is playing: editing is paused. */
  locked: boolean;
  activeNodeId: NodeId | null;
  errorNodeId: NodeId | null;
  newId: IdFactory;
  onEdit(op: EditOp): void;
}

export function Editor({ program, allowedCommands, maxInstructions, locked, activeNodeId, errorNodeId, newId, onEdit }: EditorProps) {
  const [selection, setSelection] = useState<Selection>(null);
  const focusAfter = useRef<NodeId | 'palette' | null>(null);
  const cardRefs = useRef(new Map<NodeId, HTMLButtonElement>());
  const paletteRef = useRef<HTMLDivElement>(null);
  const body = mainBody(program);
  const used = countNodes(program);
  const full = maxInstructions !== undefined && used >= maxInstructions;

  useEffect(() => {
    if (locked) setSelection(null);
  }, [locked]);

  // Move keyboard focus to whatever was just placed.
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === 'palette') paletteRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    else cardRefs.current.get(target)?.focus();
  });

  const selectedLabel =
    selection?.from === 'palette'
      ? COMMANDS[selection.command].label
      : selection?.from === 'program'
        ? COMMANDS[body.find((n) => n.id === selection.id)?.kind ?? 'forward'].label
        : '';

  const place = (slot: number) => {
    if (!selection) return;
    if (selection.from === 'palette') {
      if (full) return;
      const node = { id: newId(), kind: selection.command };
      onEdit({ op: 'insert', slot, node });
      focusAfter.current = node.id;
    } else {
      onEdit({ op: 'move', id: selection.id, slot });
      focusAfter.current = selection.id;
    }
    setSelection(null);
  };

  const remove = (id: NodeId) => {
    const index = body.findIndex((n) => n.id === id);
    onEdit({ op: 'delete', id });
    const neighbour = body[index + 1] ?? body[index - 1];
    focusAfter.current = neighbour && neighbour.id !== id ? neighbour.id : 'palette';
    setSelection(null);
  };

  const slotOpen = (slot: number) => {
    if (!selection || locked) return false;
    if (selection.from === 'palette') return !full;
    return !isNoOpMove(program, selection.id, slot);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selection) {
      e.stopPropagation();
      setSelection(null);
    }
  };

  const slot = (i: number) => {
    const open = slotOpen(i);
    const emptyProgram = body.length === 0;
    if (!open) {
      return (
        <li key={`slot-${i}`} className={`slot ${emptyProgram ? 'slot-empty' : 'slot-idle'}`} aria-hidden="true">
          {emptyProgram && <span>Tap a card, then tap here</span>}
        </li>
      );
    }
    return (
      <li key={`slot-${i}`} className="slot slot-open">
        <button type="button" onClick={() => place(i)} aria-label={`Put ${selectedLabel} at step ${i + 1}`}>
          <span aria-hidden="true">Put it here</span>
        </button>
      </li>
    );
  };

  return (
    <div className="editor" onKeyDown={onKeyDown}>
      <section className="palette" aria-label="Command cards">
        <h2 className="panel-title">Cards</h2>
        <div className="palette-cards" ref={paletteRef}>
          {allowedCommands.map((command) => {
            const info = COMMANDS[command];
            const selected = selection?.from === 'palette' && selection.command === command;
            return (
              <button
                key={command}
                type="button"
                className={`card card-${command} ${selected ? 'is-selected' : ''}`}
                aria-pressed={selected}
                aria-label={`${info.description} card`}
                disabled={locked || full}
                onClick={() => setSelection(selected ? null : { from: 'palette', command })}
              >
                <span className="card-icon">{info.icon}</span>
                <span className="card-label">{info.label}</span>
              </button>
            );
          })}
          {selection?.from === 'program' && (
            <button type="button" className="card card-remove" onClick={() => remove(selection.id)} aria-label={`Remove the selected ${selectedLabel} step`}>
              <span className="card-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="28" height="28">
                  <path d="M7 10h18M13 10V7h6v3M10 10l1 16h10l1-16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="card-label">Remove</span>
            </button>
          )}
        </div>
        {full && !locked && <p className="palette-note">No room for more steps. Remove one to add another.</p>}
      </section>

      <section className="program" aria-label="Your program">
        <h2 className="panel-title">
          Program
          {maxInstructions !== undefined && (
            <span className={`capacity ${full ? 'is-full' : ''}`}>
              {used} of {maxInstructions} steps
            </span>
          )}
        </h2>
        <ol className="program-list">
          {slot(0)}
          {body.flatMap((node, i) => {
            const info = COMMANDS[node.kind];
            const selected = selection?.from === 'program' && selection.id === node.id;
            const state = node.id === errorNodeId ? 'is-error' : node.id === activeNodeId ? 'is-active' : '';
            return [
              <li key={node.id} className="program-step">
                <span className="step-number" aria-hidden="true">
                  {i + 1}
                </span>
                <button
                  ref={(el) => {
                    if (el) cardRefs.current.set(node.id, el);
                    else cardRefs.current.delete(node.id);
                  }}
                  type="button"
                  className={`card card-${node.kind} ${selected ? 'is-selected' : ''} ${state}`}
                  aria-pressed={selected}
                  aria-label={`Step ${i + 1}: ${info.description}${state === 'is-active' ? ', running' : ''}${state === 'is-error' ? ', problem here' : ''}`}
                  data-node-id={node.id}
                  disabled={locked}
                  onClick={() => setSelection(selected ? null : { from: 'program', id: node.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      remove(node.id);
                    }
                  }}
                >
                  <span className="card-icon">{info.icon}</span>
                  <span className="card-label">{info.label}</span>
                </button>
              </li>,
              slot(i + 1),
            ];
          })}
        </ol>
      </section>
    </div>
  );
}
