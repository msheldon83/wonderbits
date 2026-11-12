// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import type { RealWord } from '../lessons/types';
import { CodePanel, RealWordsContext } from './CodePanel';

afterEach(cleanup);

const met: RealWord[] = [
  { word: 'call', code: 'robot.forward()', text: 'This line calls forward.' },
  { word: 'loop', code: 'for', text: 'A Repeat card is a loop.' },
  { word: 'while loop', code: 'while', text: 'Repeat until is a while loop.' },
  { word: 'state', text: 'What is true right now.' },
];
const program = programFromSpec([{ repeat: 2, do: ['forward'] }], sequentialIdFactory());

describe('CodePanel: real words', () => {
  it('offers the words met so far whose code is in the program, and opens one on a tap', () => {
    render(
      <RealWordsContext.Provider value={met}>
        <CodePanel program={program} activeNodeId={null} />
      </RealWordsContext.Provider>,
    );
    expect(screen.getByText('Real words in this code')).toBeTruthy();
    // No while in this program, and an idea has no code to find.
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['robot.forward(), call', 'for, loop']);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'for, loop' }));
    expect(screen.getByRole('status').textContent).toBe('loop A Repeat card is a loop.');
    fireEvent.click(screen.getByRole('button', { name: 'for, loop' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows nothing about words when none are met', () => {
    render(<CodePanel program={program} activeNodeId={null} />);
    expect(screen.queryByText('Real words in this code')).toBeNull();
  });

  it('in an introduction shows the new words as given, the first one open', () => {
    render(<CodePanel program={program} activeNodeId={null} newWords={[met[3]!, met[1]!]} />);
    expect(screen.getByText('New real words')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['state', 'for, loop']);
    expect(screen.getByRole('status').textContent).toBe('state What is true right now.');
  });
});
