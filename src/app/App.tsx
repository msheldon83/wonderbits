import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { introductionBefore } from '../lessons/concepts';
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
  const store = useMemo(() => {
    const s = new ProgressStore(defaultStore());
    s.setLevels(choices.map((c) => c.level));
    return s;
  }, [choices]);
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
  /** Where the card book was opened from, for the log: a level id or "map". */
  const cameFrom = useRef('map');
  useEffect(() => {
    if (route.screen === 'level') cameFrom.current = route.id;
    else if (route.screen === 'map') cameFrom.current = 'map';
  }, [route]);

  const goTo = (hash: string) => {
    location.hash = hash;
  };

  if (!snap.loaded) {
    return (
      <div className="app">
        <p className="loading" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return (
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
      {route.screen === 'map' && <MapScreen choices={choices} book={book} store={store} badges={snap.progress.badges} packId={route.packId} />}
      {route.screen === 'settings' && <SettingsScreen store={store} settings={snap.settings} />}
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
        />
      )}
    </div>
  );
}
