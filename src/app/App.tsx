import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { defaultStore } from '../progress/storage';
import { ProgressStore } from '../progress/store';
import { useRoute, useRuntime } from './hooks';
import { Lesson } from './Lesson';
import { allLevels, hashFor, nextLevelId } from './levels';
import { MapScreen } from './MapScreen';
import { SettingsScreen } from './SettingsScreen';

export function App() {
  const choices = useMemo(allLevels, []);
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
          <p className="level-title">
            <span className="level-number">{choice.number}</span> {choice.level.title}
          </p>
        )}
        {route.screen === 'map' && <span className="header-spacer" />}
        {route.screen === 'settings' && <p className="level-title">Settings</p>}
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
      {route.screen === 'map' && <MapScreen choices={choices} store={store} badges={snap.progress.badges} />}
      {route.screen === 'settings' && <SettingsScreen store={store} settings={snap.settings} />}
      {route.screen === 'level' && choice && allowed && (
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
