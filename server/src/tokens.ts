/**
 * Secrets the server hands out: sign-in links, session cookies, invite codes.
 * Only a hash of each is stored, so a copy of the database opens nothing.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';

/** 256 bits, safe in a URL or a cookie. */
export const randomToken = (): string => randomBytes(32).toString('base64url');

/** The tokens are long and random, so a plain fast hash is enough. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Letters and digits a person can read aloud and type: no 0/O, 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** A code as stored: capitals, with the spaces and dashes people add taken out. */
export const cleanCode = (typed: string): string => typed.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A code as shown: in fours, ABCD-EFGH. */
export const showCode = (code: string): string => code.replace(/(.{4})(?=.)/g, '$1-');
