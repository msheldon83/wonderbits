/** Add cards: the kits a creation can gain, each with a line on what it is and where the robot learns it. Nothing is locked. */
import { applyKit, hasKit, KITS, type Kit } from './kits';
import type { Creation } from './types';

export interface PackInfo {
  title: string;
  href: string;
  /** Every level of the pack is finished. */
  done: boolean;
}

export function KitPicker({ creation, packs, onAdd, onClose }: { creation: Creation; packs: Readonly<Record<string, PackInfo>>; onAdd(kit: Kit, patch: ReturnType<typeof applyKit>): void; onClose(): void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog kit-dialog" role="dialog" aria-modal="true" aria-labelledby="kits-title">
        <h2 id="kits-title" className="dialog-title">
          Add cards
        </h2>
        <ul className="kit-list">
          {KITS.map((kit) => {
            const added = hasKit(creation, kit);
            const pack = packs[kit.packId];
            return (
              <li key={kit.id} className={`kit ${added ? 'is-added' : ''}`}>
                <div className="kit-words">
                  <strong>{kit.title}</strong>
                  <span>{kit.blurb}</span>
                  {pack && !pack.done && (
                    <small>
                      The robot learns this in <a href={pack.href}>{pack.title}</a>. You can use it anyway.
                    </small>
                  )}
                </div>
                <button type="button" className="btn btn-quiet" disabled={added} onClick={() => onAdd(kit, applyKit(creation, kit))} aria-label={added ? `${kit.title}, added` : `Add ${kit.title}`}>
                  {added ? 'Added' : 'Add'}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn btn-run" autoFocus onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
