/**
 * Who is playing? On a device a grown-up has let in, the family's profiles
 * are shown; the child taps theirs and types their PIN. The PIN only tells
 * brothers and sisters apart: the server accepts it from this device alone.
 */
import { useEffect, useState } from 'react';
import { ApiError, OfflineError, type ChildInfo } from '../sync/api';
import { Avatar } from './avatars';
import type { AccountStore } from './session';

const PIN_MAX = 6;
const PIN_MIN = 4;

export function WhoScreen({ account, players, current, online }: { account: AccountStore; players: readonly ChildInfo[]; current: ChildInfo | null; online: boolean }) {
  const [picked, setPicked] = useState<ChildInfo | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Seconds left before another try is allowed. */
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const pick = (child: ChildInfo | null) => {
    setPicked(child);
    setPin('');
    setProblem(null);
    setWait(0);
  };

  const enter = async (child: ChildInfo, typed: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await account.signIn(child.id, typed);
      location.hash = '#/';
    } catch (e) {
      setPin('');
      if (e instanceof ApiError && e.code === 'wait') {
        setWait(typeof e.body.seconds === 'number' ? e.body.seconds : 30);
        setProblem('Too many tries.');
      } else if (e instanceof ApiError && e.code === 'pin') setProblem('That is not the PIN. Try again.');
      else if (e instanceof OfflineError) setProblem('No internet right now. Try again in a moment.');
      else setProblem('That did not work. Ask your grown-up.');
    } finally {
      setBusy(false);
    }
  };

  if (picked) {
    const press = (digit: string) => pin.length < PIN_MAX && setPin(pin + digit);
    return (
      <div className="account-page">
        <section className="account-card pin-card" aria-labelledby="pin-title">
          <Avatar id={picked.avatar} size={88} />
          <h1 id="pin-title" className="account-title">
            Hello, {picked.nickname}!
          </h1>
          <p className="account-lead">Type your PIN.</p>
          <p className="pin-dots" role="status" aria-label={`${pin.length} digits typed`}>
            {Array.from({ length: PIN_MAX }, (_, i) => (
              <span key={i} className={`pin-dot ${i < pin.length ? 'is-on' : ''} ${i >= PIN_MIN ? 'is-extra' : ''}`} />
            ))}
          </p>
          <p className={`account-problem ${problem ? '' : 'is-empty'}`} role="alert">
            {problem}
            {wait > 0 && ` Wait ${wait} second${wait === 1 ? '' : 's'}, or ask your grown-up.`}
          </p>
          <div className="pin-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button key={d} type="button" className="btn pin-key" disabled={busy} onClick={() => press(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="btn pin-key pin-key-quiet" disabled={busy || pin.length === 0} onClick={() => setPin(pin.slice(0, -1))} aria-label="Rub out the last digit">
              ⌫
            </button>
            <button type="button" className="btn pin-key" disabled={busy} onClick={() => press('0')}>
              0
            </button>
            <button type="button" className="btn btn-run pin-key" disabled={busy || wait > 0 || pin.length < PIN_MIN} onClick={() => void enter(picked, pin)} aria-label="Go">
              Go
            </button>
          </div>
          <button type="button" className="btn btn-quiet" onClick={() => pick(null)}>
            I am someone else
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="account-page">
      <section className="account-card" aria-labelledby="who-title">
        <h1 id="who-title" className="account-title">
          Who is playing?
        </h1>
        {players.length === 0 ? (
          <p className="account-lead">Nobody is here yet. Ask your grown-up to add you.</p>
        ) : (
          <ul className="who-list">
            {players.map((p) => (
              <li key={p.id}>
                <button type="button" className={`who-player ${current?.id === p.id ? 'is-current' : ''}`} onClick={() => (current?.id === p.id ? (location.hash = '#/') : pick(p))}>
                  <Avatar id={p.avatar} size={88} />
                  <span className="who-name">{p.nickname}</span>
                  {current?.id === p.id && <span className="ready-tag">Playing now</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!online && <p className="account-note">No internet right now. Whoever played last can keep playing; switching needs the internet.</p>}
        <p className="account-foot">
          {current && (
            <button type="button" className="btn btn-quiet" onClick={() => void account.signOut()}>
              Sign {current.nickname} out
            </button>
          )}
          <a className="btn btn-quiet" href="#/grownup">
            For the grown-up
          </a>
        </p>
      </section>
    </div>
  );
}
