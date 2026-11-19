/**
 * The two moments a level asks a child how it is going. Both are optional,
 * take one tap, and never stand between the child and what they want to do
 * next.
 *
 * - When the level is finished: how hard was it, and anything to say?
 * - When it is going badly: is this one tricky, and what is in the way?
 */
import { useState } from 'react';
import { NOTE_MAX } from './FeedbackButton';
import type { Difficulty, Insight, StuckAnswer, Visit } from './recorder';

const FACES: { value: Difficulty; face: string; label: string }[] = [
  { value: 1, face: '😀', label: 'Easy' },
  { value: 2, face: '🙂', label: 'Just right' },
  { value: 3, face: '😮‍💨', label: 'Hard' },
];

/** Under the stars, when a level is finished. */
export function RateLevel({ insight, visit }: { insight: Insight; visit: Visit }) {
  const [rated, setRated] = useState<Difficulty | null>(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState<'none' | 'sending' | 'sent' | 'failed'>('none');
  return (
    <div className="rate-level">
      <p id="rate-label" className="rate-label">
        How was that one?
      </p>
      <div className="rate-faces" role="group" aria-labelledby="rate-label">
        {FACES.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`rate-face ${rated === f.value ? 'is-on' : ''}`}
            aria-pressed={rated === f.value}
            onClick={() => {
              setRated(f.value);
              visit.rate(f.value);
            }}
          >
            <span aria-hidden="true">{f.face}</span>
            {f.label}
          </button>
        ))}
      </div>
      {note === 'sent' ? (
        <p className="tool-note" role="status">
          Sent. Thank you!
        </p>
      ) : !writing ? (
        <button type="button" className="link-button" onClick={() => setWriting(true)}>
          Tell us something about this level
        </button>
      ) : (
        <form
          className="tell-form"
          onSubmit={(e) => {
            e.preventDefault();
            setNote('sending');
            void insight.sendFeedback('level-note', text, { screen: 'level', levelId: visit.record.levelId }).then(
              () => setNote('sent'),
              () => setNote('failed'),
            );
          }}
        >
          <textarea rows={3} maxLength={NOTE_MAX} autoFocus aria-label="What do you want to tell us about this level?" placeholder="What was fun, hard or confusing?" value={text} onChange={(e) => setText(e.target.value)} />
          <p className="tool-note">This goes to the people who make Wonderbits. Your grown-up can see it too. Do not write your name or where you live.</p>
          {note === 'failed' && (
            <p className="account-problem" role="alert">
              That did not send. Check the internet and try again.
            </p>
          )}
          <button type="submit" className="btn btn-quiet" disabled={note === 'sending' || text.trim().length === 0}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}

const REASONS = ['I do not know what to do', 'I do not know which card to use', 'My program does something odd'];

/** Under the run controls, once, when a level is going badly. */
export function StuckNudge({ insight, visit, hasHints, onDone }: { insight: Insight; visit: Visit; hasHints: boolean; onDone(): void }) {
  const [step, setStep] = useState<'ask' | 'why' | 'thanks'>('ask');
  const [text, setText] = useState('');
  const answer = (a: StuckAnswer) => {
    visit.stuck(a);
    if (a === 'fine') onDone();
    else setStep('why');
  };
  const why = (reason: string) => {
    // The answer is kept even if this note cannot be sent just now.
    void insight.sendFeedback('stuck', reason, { screen: 'level', levelId: visit.record.levelId }).catch(() => undefined);
    setStep('thanks');
  };
  return (
    <aside className="stuck-nudge" aria-label="Is this one tricky?">
      {step === 'ask' && (
        <>
          <p className="stuck-ask">Is this one tricky?</p>
          <div className="choice-row">
            <button type="button" className="btn btn-quiet" onClick={() => answer('fine')}>
              I am fine
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => answer('a-bit')}>
              A bit
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => answer('very')}>
              Very
            </button>
          </div>
        </>
      )}
      {step === 'why' && (
        <>
          <p className="stuck-ask">What is in the way?</p>
          <div className="choice-row">
            {REASONS.map((r) => (
              <button key={r} type="button" className="btn btn-quiet" onClick={() => why(r)}>
                {r}
              </button>
            ))}
          </div>
          <form
            className="stuck-own"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim().length > 0) why(text);
            }}
          >
            <input type="text" maxLength={NOTE_MAX} aria-label="Or say it in your own words" placeholder="Or say it in your own words" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="btn btn-quiet" disabled={text.trim().length === 0}>
              Send
            </button>
            <button type="button" className="btn btn-quiet" onClick={onDone}>
              Skip
            </button>
          </form>
        </>
      )}
      {step === 'thanks' && (
        <>
          <p className="stuck-ask">Thank you. That helps us make it better.{hasHints && ' The Hint button can help with this one.'}</p>
          <div className="choice-row">
            <button type="button" className="btn btn-quiet" onClick={onDone}>
              OK
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
