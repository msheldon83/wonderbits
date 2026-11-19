/**
 * A child's PIN. It is short, so it is never the only lock: the server
 * accepts it only from a device the grown-up authorized, and slows down
 * after wrong guesses. It is still stored salted and hashed (scrypt, which
 * ships with Node, so there is nothing to compile).
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_BYTES = 32;

function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(pin, salt, KEY_BYTES, (err, key) => (err ? reject(err) : resolve(key))));
}

export const isPin = (value: unknown): value is string => typeof value === 'string' && /^\d{4,6}$/.test(value);

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${(await derive(pin, salt)).toString('base64url')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await derive(pin, Buffer.from(salt, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
