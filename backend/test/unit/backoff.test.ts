import { describe, expect, it } from 'vitest';
import { backoffSeconds } from '../../src/shared/jobs/queue.js';

describe('retry backoff', () => {
  it('grows with the attempt count', () => {
    const first = backoffSeconds(1);
    const fourth = backoffSeconds(4);
    expect(fourth).toBeGreaterThan(first);
  });

  it('stays bounded so a failing provider cannot push work out of reach', () => {
    for (const attempts of [1, 5, 10, 50, 1000]) {
      const delay = backoffSeconds(attempts);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(330);
    }
  });

  it('adds jitter so retries from many workers do not align', () => {
    const samples = new Set(Array.from({ length: 50 }, () => backoffSeconds(5)));
    expect(samples.size).toBeGreaterThan(1);
  });

  it('treats a zero or negative attempt count defensively', () => {
    expect(backoffSeconds(0)).toBeGreaterThan(0);
    expect(backoffSeconds(-3)).toBeGreaterThan(0);
  });
});
