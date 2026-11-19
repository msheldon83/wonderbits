/**
 * What this device is to the server: not yet let in by a grown-up, or let in
 * with a family's profiles to choose from, with or without a child signed
 * in. The last answer is kept on the device, so a child who was signed in
 * can keep playing when the internet is away.
 */
import type { KeyValueStore } from '../progress/storage';
import { api, ApiError, OfflineError, type ChildInfo, type DeviceInfo } from '../sync/api';

const CACHE_KEY = 'account';

export type AccountState =
  | { status: 'loading' }
  /** No grown-up has let this device in. The game plays as it does with no accounts. */
  | { status: 'unpaired' }
  | { status: 'paired'; device: DeviceInfo; child: ChildInfo | null; online: boolean };

const withChild = (device: DeviceInfo, online: boolean): AccountState => ({
  status: 'paired',
  device,
  child: device.children.find((c) => c.id === device.childId) ?? null,
  online,
});

export class AccountStore {
  private state: AccountState = { status: 'loading' };
  private listeners = new Set<() => void>();

  constructor(private deviceStore: KeyValueStore) {}

  getSnapshot = (): AccountState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(state: AccountState): void {
    this.state = state;
    for (const l of this.listeners) l();
  }

  /** Ask the server who this device is. Offline, go by what it said last time. */
  async refresh(): Promise<void> {
    try {
      const device = await api.device();
      await this.deviceStore.set(CACHE_KEY, device);
      this.set(withChild(device, true));
    } catch (e) {
      if (e instanceof OfflineError || (e instanceof ApiError && e.status >= 500)) {
        const cached = await this.deviceStore.get<DeviceInfo>(CACHE_KEY);
        this.set(cached ? withChild(cached, false) : { status: 'unpaired' });
        return;
      }
      // The server knows nothing of this device, or the grown-up took it away.
      await this.deviceStore.delete(CACHE_KEY);
      this.set({ status: 'unpaired' });
    }
  }

  /** Throws ApiError "pin" for a wrong PIN and "wait" (with seconds) after too many. */
  async signIn(childId: string, pin: string): Promise<void> {
    await api.childSignIn(childId, pin);
    await this.refresh();
  }

  async signOut(): Promise<void> {
    await api.childSignOut().catch(() => undefined);
    const cached = await this.deviceStore.get<DeviceInfo>(CACHE_KEY);
    // Even offline, switching player takes effect here at once.
    if (cached) await this.deviceStore.set(CACHE_KEY, { ...cached, childId: null });
    await this.refresh();
  }
}

/** A name for this device a grown-up will recognise in a list. They can see it; they cannot yet change it. */
export function deviceName(userAgent: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints): string {
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'iPad';
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/CrOS/.test(userAgent)) return 'Chromebook';
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? 'Android phone' : 'Android tablet';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows computer';
  if (/Linux/.test(userAgent)) return 'Linux computer';
  return 'A device';
}
