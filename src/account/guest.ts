/**
 * Progress made on a device before anyone signed in belongs to nobody in
 * particular. A grown-up can give it to one of their children: it is joined
 * into that child's profile with the same rules sync uses, so nothing the
 * child already has is lost, and the device's own copy is left as it was.
 */
import { profilePrefix, scopedStore, type KeyValueStore } from '../progress/storage';
import type { ObservationEvent, Progress } from '../progress/types';
import { markDirty } from '../sync/engine';
import { mergeDrafts, mergeProgress, type Drafts } from '../sync/merge';

const DONE_KEY = 'account:guestHandled';

/** True when the device holds stars or creations from before sign-in that nobody has dealt with yet. */
export async function hasGuestProgress(device: KeyValueStore): Promise<boolean> {
  if (await device.get<boolean>(DONE_KEY)) return false;
  const progress = await device.get<Progress>('progress');
  if (progress && Object.keys(progress.levels).length > 0) return true;
  return (await device.keys('creation:')).length > 0;
}

/** The grown-up said "not now", or it is done: do not offer again. */
export const dismissGuestProgress = (device: KeyValueStore): Promise<void> => device.set(DONE_KEY, true);

/** `mark` says how to note what changed for sending: a running sync engine's own way when there is one, else straight into storage. Returns the keys that changed. */
export async function importGuestProgress(device: KeyValueStore, childId: string, mark?: (keys: string[]) => Promise<void>): Promise<string[]> {
  const child = scopedStore(device, profilePrefix(childId));
  const changed: string[] = [];

  const progress = await device.get<Progress>('progress');
  if (progress) {
    const theirs = await child.get<Progress>('progress');
    await child.set('progress', theirs ? mergeProgress(theirs, progress) : progress);
    changed.push('progress');
  }
  const drafts = await device.get<Drafts>('drafts');
  if (drafts) {
    await child.set('drafts', mergeDrafts((await child.get<Drafts>('drafts')) ?? {}, drafts));
    changed.push('drafts');
  }
  for (const key of await device.keys('creation:')) {
    if ((await child.get(key)) !== undefined) continue;
    await child.set(key, await device.get(key));
    changed.push(key);
  }
  // The log stays on this device either way; it follows the progress into the child's corner of it.
  const log = await device.get<ObservationEvent[]>('log');
  if (log && (await child.get('log')) === undefined) await child.set('log', log);

  await (mark ? mark(changed) : markDirty(child, changed));
  await dismissGuestProgress(device);
  return changed;
}
