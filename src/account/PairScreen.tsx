/**
 * Letting a device in. The device shows a short code; the grown-up types it
 * into their own page on a phone or computer. Until they do, the code opens
 * nothing. The screen watches for the answer by itself.
 */
import { useEffect, useState } from 'react';
import { api, ApiError, OfflineError } from '../sync/api';
import { deviceName, type AccountStore } from './session';

const showCode = (code: string) => code.replace(/(.{3})(?=.)/g, '$1 ');

export function PairScreen({ account }: { account: AccountStore }) {
  const [code, setCode] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setCode((await api.startPairing(deviceName())).code);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already-paired') await account.refresh();
      else setProblem(e instanceof OfflineError ? 'No internet right now. Try again in a moment.' : 'That did not work. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  // While a code is showing, look every few seconds for the grown-up's yes.
  useEffect(() => {
    if (!code) return;
    const poll = setInterval(() => void account.refresh(), 3000);
    // A code is good for ten minutes; after that, offer a new one.
    const expire = setTimeout(() => setCode(null), 10 * 60 * 1000);
    return () => {
      clearInterval(poll);
      clearTimeout(expire);
    };
  }, [code, account]);

  return (
    <div className="account-page">
      <section className="account-card" aria-labelledby="pair-title">
        <h1 id="pair-title" className="account-title">
          Set up this device
        </h1>
        {code ? (
          <>
            <p className="account-lead">Ask your grown-up to type this code on their Wonderbits page.</p>
            <p className="pair-code" aria-label={`The code is ${code.split('').join(' ')}`}>
              {showCode(code)}
            </p>
            <p className="account-note" role="status">
              Waiting for your grown-up… This screen moves on by itself.
            </p>
          </>
        ) : (
          <>
            <p className="account-lead">A grown-up needs to let this device in. Then your stars and the things you make are kept safe, and you can play on another device too.</p>
            <p className="account-foot">
              <button type="button" className="btn btn-run" disabled={busy} onClick={() => void start()}>
                Show a code
              </button>
            </p>
          </>
        )}
        {problem && (
          <p className="account-problem" role="alert">
            {problem}
          </p>
        )}
        <p className="account-foot">
          <a className="btn btn-quiet" href="#/grownup">
            I am the grown-up
          </a>
          <a className="btn btn-quiet" href="#/">
            Play without signing in
          </a>
        </p>
      </section>
    </div>
  );
}
