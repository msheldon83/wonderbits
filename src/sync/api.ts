/**
 * The one place the game talks to the server. Everything goes to /api on the
 * page's own origin, with the sign-in cookies the server set; a build without
 * accounts never calls any of it.
 */

/** True in a build made to run with the server. Without it the game is exactly the local-only game. */
export const ACCOUNTS: boolean = import.meta.env?.VITE_ACCOUNTS === '1';

/** The server said no, and why. `code` is the server's word for it, such as "pin" or "signed-out". */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/** The server could not be reached at all: offline, or it is down. */
export class OfflineError extends Error {}

export async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
      method,
      credentials: 'same-origin',
      ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new OfflineError();
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // A gateway answering for a server that is down is the same to the child as no network.
  if (res.status >= 502 && res.status <= 504) throw new OfflineError();
  if (!res.ok) throw new ApiError(res.status, typeof data.error === 'string' ? data.error : 'server', data);
  return data as T;
}

export interface ChildInfo {
  id: string;
  nickname: string;
  avatar: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  children: ChildInfo[];
  childId: string | null;
  siblingSharing: boolean;
}

export interface RemoteDoc {
  key: string;
  value: unknown;
  rev: number;
  deleted: boolean;
}

export interface InboxShare {
  id: string;
  creation: unknown;
  createdAt: string;
  seenAt: string | null;
  fromNickname: string;
  fromAvatar: string;
}

export interface FamilyShare extends InboxShare {
  fromChildId: string;
  toChildId: string | null;
  toNickname: string | null;
}

export interface ParentInfo {
  email: string;
  notifyByEmail: boolean;
  siblingSharing: boolean;
}

export interface FamilyInfo {
  children: (ChildInfo & { lastActiveAt: string | null; createdAt: string })[];
  devices: { id: string; name: string; lastSeenAt: string | null; createdAt: string }[];
  thisDeviceId: string | null;
}

export interface ChildExport {
  exportedAt: string;
  child: ChildInfo & { createdAt: string; lastActiveAt: string | null; consentVersion: string; consentedAt: string };
  documents: { key: string; value: unknown; updatedAt: string }[];
  shares: unknown[];
}

export const api = {
  // The device and the child on it.
  device: () => call<DeviceInfo>('GET', '/device'),
  startPairing: (name: string) => call<{ code: string; expiresAt: string }>('POST', '/pair/start', { name }),
  childSignIn: (childId: string, pin: string) => call<{ childId: string }>('POST', '/child/signin', { childId, pin }),
  childSignOut: () => call<{ ok: true }>('POST', '/child/signout', {}),

  // A child's documents.
  pull: (since: number) => call<{ docs: RemoteDoc[]; rev: number }>('GET', `/sync?since=${since}`),
  push: (key: string, body: { baseRev: number; value: unknown; deleted?: boolean }) => call<{ rev: number }>('PUT', `/sync/${encodeURIComponent(key)}`, body),

  // Sharing inside the family.
  share: (to: string, creation: unknown) => call<{ id: string }>('POST', '/shares', { to, creation }),
  inbox: () => call<{ shares: InboxShare[] }>('GET', '/shares'),
  markSeen: (id: string) => call<{ ok: true }>('POST', `/shares/${id}/seen`, {}),

  // The grown-up.
  parentStart: (email: string, inviteCode?: string) => call<{ ok: true }>('POST', '/parent/start', { email, ...(inviteCode && { inviteCode }) }),
  parentFinish: (token: string) => call<{ email: string }>('POST', '/parent/finish', { token }),
  parent: () => call<ParentInfo>('GET', '/parent/me'),
  updateParent: (patch: Partial<Pick<ParentInfo, 'notifyByEmail' | 'siblingSharing'>>) => call<ParentInfo>('PATCH', '/parent/me', patch),
  parentSignOut: () => call<{ ok: true }>('POST', '/parent/signout', {}),
  deleteAccount: () => call<{ ok: true }>('DELETE', '/parent/me'),
  family: () => call<FamilyInfo>('GET', '/family'),
  addChild: (child: { nickname: string; avatar: string; pin: string; consent: boolean }) => call<ChildInfo>('POST', '/children', child),
  updateChild: (id: string, patch: { nickname?: string; avatar?: string; pin?: string }) => call<ChildInfo>('PATCH', `/children/${id}`, patch),
  signOutChild: (id: string) => call<{ ok: true }>('POST', `/children/${id}/signout`, {}),
  exportChild: (id: string) => call<ChildExport>('GET', `/children/${id}/export`),
  deleteChild: (id: string) => call<{ ok: true }>('DELETE', `/children/${id}`),
  allowThisDevice: (name: string) => call<{ id: string; name: string }>('POST', '/devices', { name }),
  approveDevice: (code: string) => call<{ id: string; name: string }>('POST', '/devices/approve', { code }),
  removeDevice: (id: string) => call<{ ok: true }>('DELETE', `/devices/${id}`),
  familyShares: () => call<{ shares: FamilyShare[] }>('GET', '/family/shares'),
  markFamilyShareSeen: (id: string) => call<{ ok: true }>('POST', `/family/shares/${id}/seen`, {}),
  deleteShare: (id: string) => call<{ ok: true }>('DELETE', `/family/shares/${id}`),
};
