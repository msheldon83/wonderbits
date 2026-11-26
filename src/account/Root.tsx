/**
 * The top of the app when it is built with accounts. It decides what this
 * device is showing: the game as a signed-in child (their own corner of
 * storage, kept in step with the server), the game as nobody in particular
 * (exactly the local-only game), or one of the account screens. A build
 * without accounts never loads any of this.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { App, type AccountProps, type Sharing } from '../app/App';
import { creationToJson } from '../create/parse';
import { defaultStore, profilePrefix, scopedStore, type KeyValueStore } from '../progress/storage';
import { Insight } from '../insight/recorder';
import { api, ApiError, APP_VERSION, OfflineError, type ChildInfo, type DeviceInfo, type InboxShare } from '../sync/api';
import { SyncEngine, type SyncApi } from '../sync/engine';
import { AdminScreen } from './AdminScreen';
import { Avatar } from './avatars';
import { GrownupScreen } from './GrownupScreen';
import { PairScreen } from './PairScreen';
import { PrivacyScreen } from './PrivacyScreen';
import { dismissGuestProgress, hasGuestProgress, importGuestProgress } from './guest';
import { AccountStore } from './session';
import { WhoScreen } from './WhoScreen';

export type AccountRoute = { screen: 'grownup'; token?: string; invite?: string } | { screen: 'pair' } | { screen: 'who' } | { screen: 'privacy' } | { screen: 'admin' } | null;

/** The account screens' addresses. Anything else belongs to the game. */
export function parseAccountRoute(hash: string): AccountRoute {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'grownup') return { screen: 'grownup' };
  const link = /^grownup\/signin\/([^/]+)$/.exec(path);
  if (link) return { screen: 'grownup', token: decodeURIComponent(link[1]!) };
  // A link someone was sent: the invite code rides along, to be filled in for them.
  const invited = /^grownup\/invite\/([^/]+)$/.exec(path);
  if (invited) return { screen: 'grownup', invite: decodeURIComponent(invited[1]!) };
  if (path === 'pair' || path === 'who' || path === 'privacy' || path === 'admin') return { screen: path };
  return null;
}

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

const syncApi: SyncApi = {
  pull: (since) => api.pull(since),
  push: (key, body) =>
    api.push(key, body).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 409 && e.code === 'conflict') return { conflict: e.body.doc as never };
      throw e;
    }),
};

/** How long after a change the game waits before sending it, so a burst of edits goes up once. */
const SEND_DELAY_MS = 1500;
/** How often an open game looks for what another device did. */
const LOOK_EVERY_MS = 60_000;

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="app screen-account">
      <header className="app-header">
        <a className="brand" href="#/">
          Wonderbits
        </a>
        <p className="level-title">{title}</p>
      </header>
      {children}
    </div>
  );
}

/** The game for a signed-in child. */
function ChildGame({ deviceStore, account, child, device, startsOnline }: { deviceStore: KeyValueStore; account: AccountStore; child: ChildInfo; device: DeviceInfo; startsOnline: boolean }) {
  const local = useMemo(() => scopedStore(deviceStore, profilePrefix(child.id)), [deviceStore, child.id]);
  const engine = useMemo(() => new SyncEngine(local, syncApi), [local]);
  // Feedback loops: only while the grown-up leaves "Help improve Wonderbits" on.
  const insight = useMemo(
    () =>
      device.improve
        ? new Insight(
            local,
            {
              batch: (batch) =>
                api.insightBatch(batch).catch((e: unknown) => {
                  throw e instanceof ApiError && e.code === 'off' ? Object.assign(e, { code: 'off' }) : e;
                }),
              feedback: (kind, text, context) => api.feedback(kind, text, context),
            },
            APP_VERSION,
          )
        : undefined,
    [local, device.improve],
  );
  const [saved, setSaved] = useState(true);
  const [inbox, setInbox] = useState<InboxShare[]>([]);
  /** Whether the server can be reached right now, going by the last try. Offline, the child is not asked for feedback. */
  const [online, setOnline] = useState(startsOnline);
  // Stars and creations from before anyone signed in on this device: ask the child, once, whether they are theirs.
  const [earlier, setEarlier] = useState(false);
  useEffect(() => void hasGuestProgress(deviceStore).then(setEarlier), [deviceStore]);
  const bringEarlier = () => {
    setEarlier(false);
    void importGuestProgress(deviceStore, child.id, (keys) => engine.mark(keys)).then((keys) => engine.onPulled(keys));
  };
  const leaveEarlier = () => {
    setEarlier(false);
    void dismissGuestProgress(deviceStore);
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    const run = () =>
      void engine
        .sync()
        .then(() => insight?.flush())
        .then(() => api.inbox())
        .then(({ shares }) => {
          if (!live) return;
          setInbox(shares.filter((s) => !s.seenAt));
          setOnline(true);
        })
        .catch((e: unknown) => {
          if (e instanceof OfflineError && live) setOnline(false);
          // Signed out from elsewhere, or the device was taken away: find out which.
          if (e instanceof ApiError && e.status === 401) void account.refresh();
        })
        .finally(() => live && setSaved(!engine.pending));
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(run, SEND_DELAY_MS);
    };
    engine.onDirty = () => {
      setSaved(false);
      soon();
    };
    if (insight) insight.onWaiting = soon;
    const onVisible = () => run();
    const onOffline = () => setOnline(false);
    window.addEventListener('offline', onOffline);
    run();
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    // Leaving the page is the last chance to send what was just done.
    document.addEventListener('visibilitychange', onVisible);
    const look = setInterval(() => document.visibilityState === 'visible' && run(), LOOK_EVERY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      clearInterval(look);
      engine.onDirty = () => {};
      if (insight) insight.onWaiting = () => {};
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [engine, insight, account]);

  const onReload = useCallback(
    (reload: () => void) => {
      engine.onPulled = reload;
      return () => {
        engine.onPulled = () => {};
      };
    },
    [engine],
  );

  const sharing: Sharing = useMemo(
    () => ({
      siblings: device.siblingSharing ? device.children.filter((c) => c.id !== child.id) : [],
      inbox,
      send: async (to, creation) => {
        // What a game remembers between plays (a best score, say) is its player's own, and stays behind.
        const { saved: _saved, ...sendable } = creationToJson(creation);
        await api.share(to, sendable);
      },
      settle: (id) => {
        setInbox((before) => before.filter((s) => s.id !== id));
        void api.markSeen(id).catch(() => undefined);
      },
    }),
    [device, child.id, inbox],
  );

  const props: AccountProps = {
    nickname: child.nickname,
    synced: true,
    onReload,
    sharing,
    insight,
    prompts: online,
    deviceStore,
    who: (
      <a className="who-chip" href="#/who" title="Switch player">
        <Avatar id={child.avatar} size={32} />
        <span>{child.nickname}</span>
      </a>
    ),
    panel: (
      <section className="settings-group" aria-labelledby="settings-account">
        <h2 id="settings-account" className="panel-title">
          Player
        </h2>
        <div className="setting">
          <span className="player-line">
            <Avatar id={child.avatar} size={40} /> Playing as {child.nickname}
          </span>
          <small role="status">{saved ? 'Everything is saved.' : 'Saving… If there is no internet, it is kept here and sent later.'}</small>
        </div>
        <div className="setting">
          <span className="choice-row">
            <a className="btn btn-quiet" href="#/who">
              Switch player
            </a>
            <a className="btn btn-quiet" href="#/grownup">
              For the grown-up
            </a>
          </span>
        </div>
      </section>
    ),
  };
  return (
    <>
      <App storage={engine.store} account={props} />
      {earlier && (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="earlier-title">
            <h2 id="earlier-title" className="dialog-title">
              Are these yours?
            </h2>
            <p className="account-lead">Someone played on this device before signing in. Are those stars, and anything that was made, yours?</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-run" autoFocus onClick={bringEarlier}>
                Yes, bring them
              </button>
              <button type="button" className="btn btn-quiet" onClick={leaveEarlier}>
                No
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function AccountRoot() {
  const deviceStore = useMemo(defaultStore, []);
  const account = useMemo(() => new AccountStore(deviceStore), [deviceStore]);
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot);
  useEffect(() => void account.refresh(), [account]);
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => '');
  const route = parseAccountRoute(hash);

  // A device that has been let in has no use for the code screen.
  const paired = state.status === 'paired';
  useEffect(() => {
    if (paired && route?.screen === 'pair') location.hash = '#/who';
  }, [paired, route?.screen]);

  if (route?.screen === 'privacy')
    return (
      <Shell title="Privacy">
        <PrivacyScreen />
      </Shell>
    );
  if (route?.screen === 'admin')
    return (
      <Shell title="The owner's page">
        <AdminScreen />
      </Shell>
    );
  if (route?.screen === 'grownup')
    return (
      <Shell title="For the grown-up">
        <GrownupScreen account={account} deviceStore={deviceStore} token={route.token} invite={route.invite} />
      </Shell>
    );
  if (state.status === 'loading')
    return (
      <div className="app">
        <p className="loading" role="status">
          Loading…
        </p>
      </div>
    );

  if (state.status === 'unpaired') {
    if (route?.screen === 'pair' || route?.screen === 'who')
      return (
        <Shell title="Set up">
          <PairScreen account={account} />
        </Shell>
      );
    // Nobody has let this device in: the game as it is with no accounts, and a way to begin.
    const panel = (
      <section className="settings-group" aria-labelledby="settings-account">
        <h2 id="settings-account" className="panel-title">
          Keep your progress safe
        </h2>
        <div className="setting">
          <span className="choice-row">
            <a className="btn btn-quiet" href="#/pair">
              Set up this device
            </a>
            <a className="btn btn-quiet" href="#/grownup">
              For the grown-up
            </a>
          </span>
          <small>An account keeps your stars and the things you make safe, so they are never lost, and lets you play on another device too. You need one to go past the first island. Ask your grown-up to set one up.</small>
        </div>
      </section>
    );
    const who = (
      <a className="who-chip is-guest" href="#/pair" title="Sign in, or set up an account">
        Sign in
      </a>
    );
    return <App storage={deviceStore} account={{ panel, who, guest: true, deviceStore }} />;
  }

  // Let in, with nobody signed in: the only thing to do is say who is playing.
  if (!state.child || route?.screen === 'who' || route?.screen === 'pair')
    return (
      <Shell title="Players">
        <WhoScreen account={account} players={state.device.children} current={state.child} online={state.online} />
      </Shell>
    );
  return <ChildGame key={state.child.id} deviceStore={deviceStore} account={account} child={state.child} device={state.device} startsOnline={state.online} />;
}

export function Root({ accounts }: { accounts: boolean }) {
  return accounts ? <AccountRoot /> : <App />;
}
