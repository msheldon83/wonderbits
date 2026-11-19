import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { introductionBefore, realWordsOf } from '../lessons/concepts';
import { RealWordsContext } from '../editor/CodePanel';
import { CreateScreen } from '../create/CreateScreen';
import { CreationScreen } from '../create/CreationScreen';
import { CREATION_CARDS } from '../create/cards';
import type { CardId } from '../ir/types';
import { LibraryScreen } from '../create/LibraryScreen';
import { MadeHere } from '../create/MadeHere';
import { creationToJson } from '../create/parse';
import { PlayScreen } from '../create/PlayScreen';
import { remixOf } from '../create/remix';
import { CreationStore } from '../create/store';
import { defaultStore, type KeyValueStore } from '../progress/storage';
import type { ChildInfo, InboxShare } from '../sync/api';
import type { Creation } from '../create/types';
import { ProgressStore } from '../progress/store';
import { CardBookScreen } from './CardBookScreen';
import { ConceptIntro } from './ConceptIntro';
import { useRoute, useRuntime } from './hooks';
import { Lesson } from './Lesson';
import { hashFor, loadContent, nextLevelId } from './levels';
import { MapScreen } from './MapScreen';
import { SettingsScreen } from './SettingsScreen';

const BookIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5V5.5M8 7h8M8 10.5h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Sending creations inside the family. Present only for a signed-in child. */
export interface Sharing {
  /** Brothers and sisters who can be sent a creation. Empty when the grown-up turned that off. */
  siblings: readonly ChildInfo[];
  /** What brothers and sisters have sent that this child has not yet kept or passed on. */
  inbox: readonly InboxShare[];
  /** `to` is a brother or sister's id, or "grownup". Rejects if it could not be sent. */
  send(to: string, creation: Creation): Promise<void>;
  /** The child kept or passed on something from the inbox. */
  settle(shareId: string): void;
}

/** What the account layer gives the game. All of it is absent in a build without accounts. */
export interface AccountProps {
  /** The signed-in child's nickname, put on what they make. */
  nickname?: string;
  /** True when this profile is kept on the server too. */
  synced?: boolean;
  /** Shown in the header on the map: who is playing. */
  who?: ReactNode;
  /** A section for the settings screen. */
  panel?: ReactNode;
  sharing?: Sharing;
  /** Hands over a function that re-reads storage; called when another device's changes arrive. Returns how to stop. */
  onReload?(reload: () => void): () => void;
}

export function App({ storage: given, account }: { storage?: KeyValueStore; account?: AccountProps } = {}) {
  const { choices, book } = useMemo(loadContent, []);
  const storage = useMemo(() => given ?? defaultStore(), [given]);
  const creationStore = useMemo(() => {
    const s = new CreationStore(storage);
    s.madeBy = account?.nickname;
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);
  const made = useSyncExternalStore(creationStore.subscribe, creationStore.getSnapshot);
  useEffect(() => void creationStore.load(), [creationStore]);
  const store = useMemo(() => {
    const s = new ProgressStore(storage);
    s.setLevels(choices.map((c) => c.level));
    return s;
  }, [choices, storage]);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => void store.load(), [store]);
  // Another device changed something: read it in, so the map and the shelf show it.
  const onReload = account?.onReload;
  useEffect(
    () =>
      onReload?.(() => {
        void store.load();
        void creationStore.load();
      }),
    [onReload, store, creationStore],
  );
  const route = useRoute();
  const runtime = useRuntime();

  // A level that is not open yet sends the child back to the map.
  const choice = route.screen === 'level' ? choices.find((c) => c.level.id === route.id) : undefined;
  const allowed = choice !== undefined && snap.loaded && store.isUnlocked(choice.level.id);
  useEffect(() => {
    if (route.screen === 'level' && snap.loaded && !allowed) location.hash = hashFor({ screen: 'map' });
  }, [route, snap.loaded, allowed]);
  /** A pack's first level opens with its introduction, and a level that brings a later card opens with that, once each. */
  const intro = choice ? introductionBefore(book, choice.level.id) : undefined;
  const showIntro = intro !== undefined && !store.hasSeenIntro(intro.id);
  /** A card book page the child asked for; a page for a level not reached yet goes back to the book. */
  const page = route.screen === 'book' && route.pageId !== undefined ? book.find((e) => e.id === route.pageId) : undefined;
  const pageOpen = page !== undefined && snap.loaded && store.isUnlocked(page.levelId);
  useEffect(() => {
    if (route.screen === 'book' && route.pageId !== undefined && snap.loaded && !pageOpen) location.hash = hashFor({ screen: 'book' });
  }, [route, snap.loaded, pageOpen]);
  /** A creation that is not on the shelf (thrown away, or a mistyped address) goes back to the shelf. */
  const creation = route.screen === 'make' || route.screen === 'play' ? creationStore.get(route.id) : undefined;
  /** Only a puzzle its maker has solved is offered to play. */
  const playable = route.screen === 'play' && creation?.status === 'proved';
  useEffect(() => {
    if (!made.loaded) return;
    if (route.screen === 'make' && !creation) location.hash = hashFor({ screen: 'create' });
    if (route.screen === 'play' && !playable) location.hash = creation ? hashFor({ screen: 'make', id: creation.id }) : hashFor({ screen: 'map' });
  }, [route, made.loaded, creation, playable]);
  /** The cards a creation may offer a player: creation mode's, the level's it came from, and any it has now. */
  const universe = useMemo(() => {
    if (!creation) return [];
    const base = creation.basedOn ? choices.find((c) => c.level.id === creation.basedOn)?.level.programming : undefined;
    // A game is built with every card there is, the grid cards and the two that end a game among them. A puzzle's player never gets a Win card.
    const extra: CardId[] = creation.kind === 'game' ? ['mark', 'shift', 'uncover', 'steer', 'win', 'lose'] : [];
    return [...new Set([...CREATION_CARDS, ...extra, ...(base?.allowedCommands ?? []), ...(base?.suppliedCards ?? []), ...creation.programming.allowedCommands])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation?.id, creation?.basedOn, creation?.kind, choices]);
  /** Where the card book was opened from, for the log: a level id or "map". */
  const cameFrom = useRef('map');
  useEffect(() => {
    if (route.screen === 'level') cameFrom.current = route.id;
    else if (route.screen === 'map') cameFrom.current = 'map';
  }, [route]);

  /** The real words the code panel may offer: those of every teaching card the child has reached, the newest first. */
  const metWords = useMemo(
    () => realWordsOf(book.filter((e) => store.isUnlocked(e.levelId)).reverse()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, store, snap],
  );
  /** Each pack's name, place on the map and whether it is finished: tools and kits from an unfinished pack point at it. Nothing is locked. */
  const packs = useMemo(() => {
    const out: Record<string, { title: string; href: string; done: boolean }> = {};
    for (const c of choices) {
      const pack = (out[c.packId] ??= { title: c.packTitle, href: hashFor({ screen: 'map', packId: c.packId }), done: true });
      if (!store.levelProgress(c.level.id).stars.complete) pack.done = false;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, store, snap.progress]);
  const signposts = useMemo(() => {
    const sign = (packId: string) => (packs[packId] && !packs[packId].done ? { pack: packs[packId].title, href: packs[packId].href } : undefined);
    const [gates, plates, movers] = [sign('forest-switches'), sign('forest-events'), sign('forest-time')];
    return { ...(gates && { gate: gates, switch: gates }), ...(plates && { plate: plates }), ...(movers && { beetle: movers, log: movers }) };
  }, [packs]);

  const goTo = (hash: string) => {
    location.hash = hash;
  };

  if (!snap.loaded || !made.loaded) {
    return (
      <div className="app">
        <p className="loading" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <RealWordsContext.Provider value={metWords}>
    <div className={`app screen-${route.screen}`}>
      <header className="app-header">
        <a className="brand" href={hashFor({ screen: 'map' })}>
          Wonderbits
        </a>
        {route.screen === 'level' && choice && (
          <p className="level-title" title={`${choice.packTitle}, level ${choice.number}`}>
            <span className="level-crumb">World {choice.world}</span>
            <span className="level-sep" aria-hidden="true">
              ·
            </span>
            <span className="level-crumb">Level {choice.number}</span>
            <span className="level-sep" aria-hidden="true">
              ·
            </span>
            <span className="level-name">{choice.level.title}</span>
          </p>
        )}
        {route.screen === 'map' && <span className="header-spacer" />}
        {route.screen === 'settings' && <p className="level-title">Settings</p>}
        {route.screen === 'book' && <p className="level-title">Card book</p>}
        {route.screen === 'create' && <p className="level-title">Create</p>}
        {route.screen === 'library' && <p className="level-title">Library</p>}
        {(route.screen === 'create' || route.screen === 'make') && (
          <a className="btn btn-quiet" href={hashFor({ screen: 'library' })} title="The ready-made functions a game's cards call, to read">
            Library
          </a>
        )}
        {route.screen === 'library' && (
          <a className="btn btn-quiet btn-create" href={hashFor({ screen: 'create' })}>
            Create
          </a>
        )}
        {route.screen === 'make' && <p className="level-title">Create</p>}
        {route.screen === 'play' && creation && (
          <p className="level-title">
            <span className="level-crumb">Made here</span>
            <span className="level-name">{creation.title}</span>
          </p>
        )}
        {route.screen === 'map' && account?.who}
        {(route.screen === 'map' || route.screen === 'level') && (
          <a className="btn btn-quiet btn-create" href={hashFor({ screen: 'create' })} title="Make an island of your own">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Create
            {account?.sharing && account.sharing.inbox.length > 0 && (
              <span className="count-dot" aria-label={`${account.sharing.inbox.length} new from your family`}>
                {account.sharing.inbox.length}
              </span>
            )}
          </a>
        )}
        {(route.screen === 'map' || route.screen === 'level') && (
          <a className="btn btn-quiet btn-book" href={hashFor({ screen: 'book' })} title="Every card the robot has learned">
            <BookIcon />
            Card book
          </a>
        )}
        {route.screen === 'map' ? (
          <a className="btn btn-quiet" href={hashFor({ screen: 'settings' })}>
            Settings
          </a>
        ) : (
          <a className="btn btn-quiet" href={hashFor({ screen: 'map' })}>
            Map
          </a>
        )}
      </header>
      {route.screen === 'map' && <MapScreen choices={choices} book={book} store={store} badges={snap.progress.badges} packId={route.packId} extra={<MadeHere creations={made.creations} progress={store} />} />}
      {route.screen === 'settings' && <SettingsScreen store={store} settings={snap.settings} creations={() => made.creations.map(creationToJson)} account={account?.panel} synced={account?.synced} />}
      {route.screen === 'library' && <LibraryScreen {...(route.id !== undefined && { entryId: route.id })} />}
      {route.screen === 'create' && <CreateScreen creations={made.creations} store={creationStore} progress={store} choices={choices} onGoTo={goTo} sharing={account?.sharing} />}
      {route.screen === 'make' && creation && <CreationScreen key={creation.id} creation={creation} store={creationStore} progress={store} runtime={runtime} settings={snap.settings} signposts={signposts} universe={universe} packs={packs} />}
      {route.screen === 'play' && creation && playable && <PlayScreen key={`${creation.id}:${creation.proof?.provedAt}`} creation={creation} store={creationStore} progress={store} runtime={runtime} settings={snap.settings} />}
      {route.screen === 'book' && !page && <CardBookScreen book={book} store={store} from={cameFrom.current} />}
      {route.screen === 'book' && page && pageOpen && (
        <ConceptIntro key={`book-${page.id}`} entry={page} runtime={runtime} store={store} settings={snap.settings} replay onDone={() => goTo(hashFor({ screen: 'book' }))} />
      )}
      {route.screen === 'level' && choice && allowed && showIntro && intro && (
        <ConceptIntro key={`intro-${intro.id}`} entry={intro} runtime={runtime} store={store} settings={snap.settings} replay={false} onDone={() => store.markIntroSeen(intro.id)} />
      )}
      {route.screen === 'level' && choice && allowed && !showIntro && (
        <Lesson
          key={choice.level.id}
          level={choice.level}
          runtime={runtime}
          store={store}
          settings={snap.settings}
          nextLevelId={nextLevelId(choices, choice.level.id)}
          onGoTo={goTo}
          onRemix={() => {
            const remix = creationStore.add(remixOf(choice.level));
            store.log({ levelId: remix.id, kind: 'creation-started', basedOn: choice.level.id });
            goTo(hashFor({ screen: 'make', id: remix.id }));
          }}
        />
      )}
    </div>
    </RealWordsContext.Provider>
  );
}
