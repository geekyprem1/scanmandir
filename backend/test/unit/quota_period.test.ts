import { describe, expect, it } from 'vitest';
import { allowancePeriodFor } from '../../src/modules/billing/quota.js';

const IST_OFFSET_MINUTES = 330;

describe('allowance period boundaries', () => {
  it('resolves a calendar month in a fixed-offset timezone', () => {
    // 2026-09-26 12:00 IST is 06:30 UTC; the September window runs from 1 September
    // 00:00 IST to 1 October 00:00 IST, i.e. 31 August 18:30 UTC to 30 September 18:30 UTC.
    const period = allowancePeriodFor(new Date('2026-09-26T06:30:00Z'), IST_OFFSET_MINUTES);

    expect(period.start.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  it('changes period exactly at the local month boundary, not the UTC one', () => {
    const lastInstantOfSeptember = allowancePeriodFor(
      new Date('2026-09-30T18:29:59.999Z'),
      IST_OFFSET_MINUTES,
    );
    const firstInstantOfOctober = allowancePeriodFor(
      new Date('2026-09-30T18:30:00.000Z'),
      IST_OFFSET_MINUTES,
    );

    expect(lastInstantOfSeptember.start.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(firstInstantOfOctober.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  it('uses the UTC calendar month when the offset is zero', () => {
    const period = allowancePeriodFor(new Date('2026-09-26T12:00:00Z'), 0);

    expect(period.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('handles the December to January rollover', () => {
    const period = allowancePeriodFor(new Date('2026-12-15T12:00:00Z'), IST_OFFSET_MINUTES);

    expect(period.start.toISOString()).toBe('2026-11-30T18:30:00.000Z');
    expect(period.end.toISOString()).toBe('2026-12-31T18:30:00.000Z');
  });
});
