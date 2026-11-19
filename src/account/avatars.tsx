/** The pictures a child's profile can wear. A fixed set: nothing is uploaded, and none of them is a photo. */

export const AVATARS = [
  { id: 'fox', face: '🦊', name: 'Fox', tint: '#ffe1c7' },
  { id: 'owl', face: '🦉', name: 'Owl', tint: '#e8dcc9' },
  { id: 'bear', face: '🐻', name: 'Bear', tint: '#ecd7c3' },
  { id: 'rabbit', face: '🐰', name: 'Rabbit', tint: '#f6e3ee' },
  { id: 'frog', face: '🐸', name: 'Frog', tint: '#d6f0cf' },
  { id: 'hedgehog', face: '🦔', name: 'Hedgehog', tint: '#eadfd3' },
  { id: 'squirrel', face: '🐿️', name: 'Squirrel', tint: '#f5dcc4' },
  { id: 'deer', face: '🦌', name: 'Deer', tint: '#f0e2c8' },
] as const;

export type AvatarId = (typeof AVATARS)[number]['id'];

export function Avatar({ id, size = 56 }: { id: string; size?: number }) {
  // A profile made with a picture this build does not know still gets one.
  const avatar = AVATARS.find((a) => a.id === id) ?? AVATARS[0];
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.58, background: avatar.tint }} aria-hidden="true">
      {avatar.face}
    </span>
  );
}
