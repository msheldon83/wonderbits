/** What every route is given: the database, the mailer and the few settings that shape behaviour. */
import type { Sql } from './db';
import type { Mailer } from './mail';

export interface Context {
  sql: Sql;
  mailer: Mailer;
  publicUrl: string;
  inviteRequired: boolean;
  /** The addresses of the people who run this copy. They may open the owner's page and are mailed new feedback. */
  adminEmails: readonly string[];
}

/** A request the server understood and will not do. The code is for the app to turn into words. */
export class Refusal extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    readonly code: string,
  ) {
    super(code);
  }
}
