/**
 * Settings: mute, reduced motion, open all levels, export, reset. The
 * export is the data source for the child-test checks; nothing leaves the
 * device otherwise.
 */
import { useState } from 'react';
import type { ProgressStore } from '../progress/store';
import type { Settings } from '../progress/types';

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsScreen({ store, settings }: { store: ProgressStore; settings: Settings }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return (
    <div className="settings">
      <section className="settings-group" aria-labelledby="settings-play">
        <h2 id="settings-play" className="panel-title">
          Playing
        </h2>
        <label className="setting">
          <input type="checkbox" checked={settings.muted} onChange={(e) => store.updateSettings({ muted: e.target.checked })} />
          <span>Mute sounds</span>
          <small>Sounds arrive in a later build; the setting is kept.</small>
        </label>
        <div className="setting" role="group" aria-labelledby="motion-label">
          <span id="motion-label">Reduce motion</span>
          <div className="choice-row">
            {(['system', 'on', 'off'] as const).map((v) => (
              <button key={v} type="button" className={`btn btn-choice ${settings.reducedMotion === v ? 'is-on' : ''}`} aria-pressed={settings.reducedMotion === v} onClick={() => store.updateSettings({ reducedMotion: v })}>
                {v === 'system' ? 'Follow the device' : v === 'on' ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="settings-adult">
        <h2 id="settings-adult" className="panel-title">
          For the grown-up
        </h2>
        <label className="setting">
          <input type="checkbox" checked={settings.openAllLevels} onChange={(e) => store.updateSettings({ openAllLevels: e.target.checked })} />
          <span>Open every level</span>
          <small>Play any level without finishing the ones before it.</small>
        </label>
        <div className="setting">
          <button type="button" className="btn btn-quiet" onClick={() => download(`wonderbits-${stamp()}.json`, JSON.stringify(store.exportFile(), null, 2))}>
            Export progress and log
          </button>
          <small>Saves a JSON file with stars, badges and everything the child did, for the child test.</small>
        </div>
        <div className="setting">
          {confirmReset ? (
            <span className="choice-row">
              <button type="button" className="btn btn-danger" onClick={() => void store.reset().then(() => setConfirmReset(false))}>
                Yes, erase everything
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmReset(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmReset(true)}>
              Reset progress
            </button>
          )}
          <small>Erases stars, badges and the log on this device. Export first if you want to keep them.</small>
        </div>
      </section>
    </div>
  );
}
