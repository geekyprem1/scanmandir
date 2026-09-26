import { getPool, type Queryable } from '../../shared/db/pool.js';
import type { VerifiedIdentity } from '../../shared/auth/verify.js';

/** An internal user row. Owned records reference [AppUser.id]. */
export interface AppUser {
  id: string;
  /** The identity provider's subject this row was resolved from. */
  identitySubject: string;
  isAnonymous: boolean;
  language: string | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  identity_subject: string;
  is_anonymous: boolean;
  language: string | null;
  created_at: Date;
}

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    identitySubject: row.identity_subject,
    isAnonymous: row.is_anonymous,
    language: row.language,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'id, identity_subject, is_anonymous, language, created_at';

/**
 * Resolves the internal user for a verified identity, creating the row on first sight.
 *
 * One statement on purpose: two concurrent first requests both upsert the same unique
 * subject and end on the same row, so a guest cannot be handed two identities by a
 * double tap. The anonymous flag is kept in step with the token, which is how the
 * in-place upgrade (docs/decisions.md D-15) becomes visible here without a second flow.
 */
export async function ensureUser(identity: VerifiedIdentity, db: Queryable = getPool()): Promise<AppUser> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (identity_subject, is_anonymous)
     VALUES ($1, $2)
     ON CONFLICT (identity_subject) DO UPDATE
        SET is_anonymous = EXCLUDED.is_anonymous,
            last_seen_at = now(),
            updated_at = CASE
                WHEN users.is_anonymous IS DISTINCT FROM EXCLUDED.is_anonymous THEN now()
                ELSE users.updated_at
            END
     RETURNING ${SELECT_COLUMNS}`,
    [identity.subject, identity.isAnonymous],
  );

  const row = rows[0];
  if (!row) {
    throw new Error('ensureUser returned no row.');
  }
  return toAppUser(row);
}

/** The profile for an internal user id, or null when it does not exist. */
export async function findUserById(userId: string, db: Queryable = getPool()): Promise<AppUser | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = $1`, [userId]);
  const row = rows[0];
  return row ? toAppUser(row) : null;
}

/**
 * Applies supported profile preferences. Returns null when the user does not exist,
 * so the caller can distinguish "no such user" from a successful update.
 */
export async function updateProfile(
  userId: string,
  update: { language: string },
  db: Queryable = getPool(),
): Promise<AppUser | null> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
        SET language = $2,
            updated_at = now()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [userId, update.language],
  );
  const row = rows[0];
  return row ? toAppUser(row) : null;
}
