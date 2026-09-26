import { getConfig } from '../../shared/config.js';
import type { Queryable } from '../../shared/db/pool.js';

export interface AllowancePeriod {
  start: Date;
  end: Date;
}

/**
 * Calendar-month boundaries in a fixed-offset timezone.
 *
 * The offset comes from configuration (Asia/Kolkata, +330 minutes, by default). A fixed
 * offset is exact for that zone because it has never observed DST; a zone that does
 * would need a real timezone database, which is deliberately not a dependency yet
 * (docs/decisions.md D-10).
 */
export function allowancePeriodFor(now: Date, offsetMinutes: number): AllowancePeriod {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();

  return {
    start: new Date(Date.UTC(year, month, 1) - offsetMinutes * 60_000),
    end: new Date(Date.UTC(year, month + 1, 1) - offsetMinutes * 60_000),
  };
}

/** The period containing `now`, from configuration. */
export function currentAllowancePeriod(now: Date = new Date()): AllowancePeriod {
  return allowancePeriodFor(now, getConfig().QUOTA_PERIOD_OFFSET_MINUTES);
}

/**
 * How much of the period's allowance is taken: every reservation counts until it is
 * consumed or released. Counting reservations rather than completed reports is
 * deliberate — a user with three scans in flight has used their three.
 */
export async function usedAllowance(db: Queryable, userId: string, period: AllowancePeriod): Promise<number> {
  const { rows } = await db.query<{ used: string }>(
    `SELECT (
         count(*) FILTER (WHERE kind = 'reserve')
       - count(*) FILTER (WHERE kind IN ('consume', 'release'))
     )::text AS used
       FROM quota_ledger
      WHERE user_id = $1 AND allowance_period_start = $2`,
    [userId, period.start],
  );
  return Number(rows[0]?.used ?? '0');
}

export interface ReservationInput {
  userId: string;
  scanId: string;
  /** Globally unique; a retried request reuses it and cannot double-reserve. */
  operationKey: string;
  period: AllowancePeriod;
}

/**
 * Takes a reservation for the period if one is available, returning false when the
 * allowance is exhausted.
 *
 * The user row is locked first so two concurrent creates cannot both pass the check —
 * the reservation is the thing standing between a request and paid provider work.
 */
export async function reserveAllowance(db: Queryable, input: ReservationInput): Promise<boolean> {
  await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [input.userId]);

  const allowance = getConfig().SCAN_FREE_ALLOWANCE_PER_PERIOD;
  if ((await usedAllowance(db, input.userId, input.period)) >= allowance) {
    return false;
  }

  await db.query(
    `INSERT INTO quota_ledger
        (user_id, scan_id, kind, operation_key, allowance_period_start, allowance_period_end)
     VALUES ($1, $2, 'reserve', $3, $4, $5)`,
    [input.userId, input.scanId, input.operationKey, input.period.start, input.period.end],
  );
  return true;
}

export interface ReservationActionInput {
  userId: string;
  scanId: string;
  /** The reserve entry this acts on. */
  reservationKey: string;
  operationKey: string;
  period: AllowancePeriod;
}

/**
 * The period a reservation was taken in.
 *
 * A release has to land in the reservation's own period, not in whatever period happens
 * to be current — a scan created at the end of a month and rejected in the next one
 * would otherwise release allowance nobody ever spent (docs/decisions.md D-10).
 */
export async function findReservationPeriod(
  db: Queryable,
  reservationKey: string,
): Promise<AllowancePeriod | null> {
  const { rows } = await db.query<{ allowance_period_start: Date; allowance_period_end: Date }>(
    `SELECT allowance_period_start, allowance_period_end
       FROM quota_ledger
      WHERE operation_key = $1 AND kind = 'reserve'`,
    [reservationKey],
  );
  const row = rows[0];
  return row ? { start: row.allowance_period_start, end: row.allowance_period_end } : null;
}

/** Releases a reservation: terminal failure or unusable input (ARCHITECTURE.md section 18). */
export async function releaseAllowance(db: Queryable, input: ReservationActionInput): Promise<void> {
  await db.query(
    `INSERT INTO quota_ledger
        (user_id, scan_id, kind, reservation_key, operation_key,
         allowance_period_start, allowance_period_end)
     VALUES ($1, $2, 'release', $3, $4, $5, $6)`,
    [
      input.userId,
      input.scanId,
      input.reservationKey,
      input.operationKey,
      input.period.start,
      input.period.end,
    ],
  );
}

/**
 * Consumes a reservation. Called once, on the first successful report for the scan;
 * a released reservation must never be consumed (ARCHITECTURE.md section 18).
 */
export async function consumeAllowance(db: Queryable, input: ReservationActionInput): Promise<void> {
  await db.query(
    `INSERT INTO quota_ledger
        (user_id, scan_id, kind, reservation_key, operation_key,
         allowance_period_start, allowance_period_end)
     VALUES ($1, $2, 'consume', $3, $4, $5, $6)`,
    [
      input.userId,
      input.scanId,
      input.reservationKey,
      input.operationKey,
      input.period.start,
      input.period.end,
    ],
  );
}

/** The reserve entry created with a scan. A release has to name it. */
export function reservationKeyFor(scanId: string): string {
  return `scan:${scanId}:reserve`;
}

/**
 * Gives back a scan's reservation when the photo never became a report — a refusal by the
 * quality gate, an image that could not be decoded, or a terminal failure.
 *
 * Returns false when there was no reservation to release, which happens when the scan
 * already reached a state that consumed or released it. Callers treat that as "nothing to
 * do" rather than an error: the ledger stays append-only and a double release is impossible
 * because the operation key is unique (TASKS P4-09).
 */
export async function releaseScanAllowance(
  db: Queryable,
  input: { userId: string; scanId: string },
): Promise<boolean> {
  const reservationKey = reservationKeyFor(input.scanId);
  const period = await findReservationPeriod(db, reservationKey);
  if (!period) return false;

  await releaseAllowance(db, {
    userId: input.userId,
    scanId: input.scanId,
    reservationKey,
    operationKey: `scan:${input.scanId}:release`,
    period,
  });
  return true;
}
