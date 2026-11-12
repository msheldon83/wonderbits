import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { introductionBefore, realWordsOf } from '../lessons/concepts';
import { RealWordsContext } from '../editor/CodePanel';
import { CreateScreen } from '../create/CreateScreen';
import { CreationScreen } from '../create/CreationScreen';
import { CREATION_CARDS } from '../create/cards';
import { MadeHere } from '../create/MadeHere';
import { creationToJson } from '../create/parse';
import { PlayScreen } from '../create/PlayScreen';
import { remixOf } from '../create/remix';
import { CreationStore } from '../create/store';
import { defaultStore } from '../progress/storage';
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

export function App() {
  const { choices, book } = useMemo(loadContent, []);
  const storage = useMemo(defaultStore, []);
  const creationStore = useMemo(() => new CreationStore(storage), [storage]);
  const made = useSyncExternalStore(creationStore.subscribe, creationStore.getSnapshot);
  useEffect(() => void creationStore.load(), [creationStore]);
  const store = useMemo(() => {
    const s = new ProgressStore(storage);
    s.setLevels(choices.map((c) => c.level));
    return s;
  }, [choices, storage]);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => void store.load(), [store]);
  const route = useRoute();
  const runtime = useRuntime();

  // A level that is not open yet sends the child back to the map.
  const choice = route.screen === 'level' ? choices.find((c) => c.level.id === route.id) : undefined;
  const allowed = choice !== undefined && snap.loaded && store.isUnlocked(choice.level.id);
  useEffect(() => {
    if (route.screen === 'level' && snap.loaded && !allowed) location.hash = hashFor({ screen: 'map' });
  }, [route, snap.loaded, allowed]);
  /** A pack's first level opens with its introduction, once. */
  const intro = choice ? introductionBefore(book, choice.level.id) : undefined;
  const showIntro = intro !== undefined && !store.hasSeenIntro(intro.packId);
  /** A card book page the child asked for; a page for an island not reached yet goes back to the book. */
  const page = route.screen === 'book' && route.packId !== undefined ? book.find((e) => e.packId === route.packId) : undefined;
  const pageOpen = page !== undefined && snap.loaded && store.isUnlocked(page.firstLevelId);
  useEffect(() => {
    if (route.screen === 'book' && route.packId !== undefined && snap.loaded && !pageOpen) location.hash = hashFor({ screen: 'book' });
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
    return [...new Set([...CREATION_CARDS, ...(base?.allowedCommands ?? []), ...(base?.suppliedCards ?? []), ...creation.programming.allowedCommands])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation?.id, creation?.basedOn, choices]);
  /** Where the card book was opened from, for the log: a level id or "map". */
  const cameFrom = useRef('map');
  useEffect(() => {
    if (route.screen === 'level') cameFrom.current = route.id;
    else if (route.screen === 'map') cameFrom.current = 'map';
  }, [route]);

  /** The real words the code panel may offer: those of every concept whose island is open, the newest concept first. */
  const metWords = useMemo(
    () => realWordsOf(book.filter((e) => store.isUnlocked(e.firstLevelId)).reverse()),
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
        {route.screen === 'make' && <p className="level-title">Create</p>}
        {route.screen === 'play' && creation && (
          <p className="level-title">
            <span className="level-crumb">Made here</span>
            <span className="level-name">{creation.title}</span>
          </p>
        )}
        {(route.screen === 'map' || route.screen === 'level') && (
          <a className="btn btn-quiet btn-create" href={hashFor({ screen: 'create' })} title="Make an island of your own">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Create
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
      {route.screen === 'settings' && <SettingsScreen store={store} settings={snap.settings} creations={() => made.creations.map(creationToJson)} />}
      {route.screen === 'create' && <CreateScreen creations={made.creations} store={creationStore} progress={store} choices={choices} onGoTo={goTo} />}
      {route.screen === 'make' && creation && <CreationScreen key={creation.id} creation={creation} store={creationStore} progress={store} runtime={runtime} settings={snap.settings} signposts={signposts} universe={universe} packs={packs} />}
      {route.screen === 'play' && creation && playable && <PlayScreen key={`${creation.id}:${creation.proof?.provedAt}`} creation={creation} progress={store} runtime={runtime} settings={snap.settings} />}
      {route.screen === 'book' && !page && <CardBookScreen book={book} store={store} from={cameFrom.current} />}
      {route.screen === 'book' && page && pageOpen && (
        <ConceptIntro key={`book-${page.packId}`} entry={page} runtime={runtime} store={store} settings={snap.settings} replay onDone={() => goTo(hashFor({ screen: 'book' }))} />
      )}
      {route.screen === 'level' && choice && allowed && showIntro && intro && (
        <ConceptIntro key={`intro-${intro.packId}`} entry={intro} runtime={runtime} store={store} settings={snap.settings} replay={false} onDone={() => store.markIntroSeen(intro.packId)} />
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
