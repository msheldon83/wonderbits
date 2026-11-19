/**
 * "Tell us": a button in the header, open at any time, for a child to say
 * that something is confusing or broken, share an idea or ask a question.
 * What they write goes to the people who make Wonderbits, with the level and
 * program in front of them attached, and their grown-up can read it too. An
 * answer to a question goes to the grown-up, never straight to the child.
 */
import { useState, type FormEvent } from 'react';
import type { FeedbackKind, Insight } from './recorder';

export const NOTE_MAX = 500;

const KINDS: { kind: FeedbackKind; label: string; ask: string }[] = [
  { kind: 'confusing', label: 'This is confusing', ask: 'What is confusing?' },
  { kind: 'problem', label: 'Something is broken', ask: 'What went wrong?' },
  { kind: 'idea', label: 'I have an idea', ask: 'What is your idea?' },
  { kind: 'question', label: 'I have a question', ask: 'What do you want to know?' },
];

export function FeedbackButton({ insight, screen, levelId }: { insight: Insight; screen: string; levelId?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('confusing');
  const [text, setText] = useState('');
  const [state, setState] = useState<'writing' | 'sending' | 'sent' | 'failed'>('writing');
  const chosen = KINDS.find((k) => k.kind === kind)!;

  const start = () => {
    setText('');
    setState('writing');
    setOpen(true);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    void insight.sendFeedback(kind, text, { screen, ...(levelId !== undefined && { levelId }) }).then(
      () => setState('sent'),
      () => setState('failed'),
    );
  };

  return (
    <>
      <button type="button" className="btn btn-quiet btn-tell" aria-haspopup="dialog" onClick={start} title="Tell the people who make Wonderbits something">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        Tell us
      </button>
      {open && (
        <div className="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <section className="dialog tell-dialog" role="dialog" aria-modal="true" aria-labelledby="tell-title">
            <h2 id="tell-title" className="dialog-title">
              Tell us
            </h2>
            {state === 'sent' ? (
              <>
                <p className="share-result" role="status">
                  Sent. Thank you!
                </p>
                {kind === 'question' && <p className="tool-note">We will send the answer to your grown-up.</p>}
                <div className="dialog-actions">
                  <button type="button" className="btn btn-run" autoFocus onClick={() => setOpen(false)}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form className="tell-form" onSubmit={submit}>
                <div className="tell-kinds" role="group" aria-label="What is it about?">
                  {KINDS.map((k) => (
                    <button key={k.kind} type="button" className={`btn btn-choice ${kind === k.kind ? 'is-on' : ''}`} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
                      {k.label}
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>{chosen.ask}</span>
                  <textarea rows={4} maxLength={NOTE_MAX} required autoFocus value={text} onChange={(e) => setText(e.target.value)} />
                </label>
                <p className="tool-note">This goes to the people who make Wonderbits. Your grown-up can see it too. Do not write your name or where you live.</p>
                {state === 'failed' && (
                  <p className="account-problem" role="alert">
                    That did not send. Check the internet and try again.
                  </p>
                )}
                <div className="dialog-actions">
                  <button type="submit" className="btn btn-run" disabled={state === 'sending' || text.trim().length === 0}>
                    Send
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
                    Not now
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
