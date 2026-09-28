import { describe, expect, it } from 'vitest';
import { evaluateRule } from '../../src/modules/knowledge/evaluator.js';
import type { EvaluableRule, EvaluationInputs } from '../../src/modules/knowledge/types.js';

function inputs(overrides: Partial<EvaluationInputs> = {}): EvaluationInputs {
  return {
    labels: new Map<string, number>(),
    traditionIds: [],
    answers: new Map<string, string>(),
    regionScope: null,
    ...overrides,
  };
}

function rule(overrides: Partial<EvaluableRule> = {}): EvaluableRule {
  return {
    traditionIds: [],
    regionScope: null,
    requiredInputs: [],
    condition: { op: 'object_present', label: 'diya' },
    ...overrides,
  };
}

describe('rules evaluator', () => {
  it('applies a rule whose condition the confirmed items meet', () => {
    const result = evaluateRule(rule(), inputs({ labels: new Map<string, number>([['diya', 2]]) }));

    expect(result.outcome).toBe('applies');
    expect(result.reasons).toEqual([]);
  });

  it('answers does_not_apply when the condition is genuinely false', () => {
    const result = evaluateRule(rule(), inputs());

    expect(result.outcome).toBe('does_not_apply');
    expect(result.reasons).toEqual([]);
  });

  it('withholds a tradition-specific rule when the user named no tradition', () => {
    // Silence about a household's tradition is not a claim that it follows none: the rule
    // waits rather than being applied to a tradition nobody chose (TASKS P6-08).
    const result = evaluateRule(
      rule({
        traditionIds: ['north_indian'],
        condition: { op: 'object_present', label: 'diya' },
      }),
      inputs({ labels: new Map<string, number>([['diya', 1]]) }),
    );

    expect(result.outcome).toBe('not_assessed');
    expect(result.reasons).toEqual(['tradition_unknown']);
  });

  it('does not apply a tradition-specific rule to another tradition', () => {
    const result = evaluateRule(
      rule({ traditionIds: ['north_indian'] }),
      inputs({
        traditionIds: ['south_indian'],
        labels: new Map<string, number>([['diya', 1]]),
      }),
    );

    expect(result.outcome).toBe('does_not_apply');
    expect(result.reasons).toEqual(['tradition_not_selected']);
  });

  it('applies once the stated tradition matches', () => {
    const result = evaluateRule(
      rule({ traditionIds: ['north_indian'] }),
      inputs({
        traditionIds: ['north_indian'],
        labels: new Map<string, number>([['diya', 1]]),
      }),
    );

    expect(result.outcome).toBe('applies');
  });

  it('names a declared input nobody answered', () => {
    const result = evaluateRule(
      rule({ requiredInputs: ['open_flame'] }),
      inputs({ labels: new Map<string, number>([['diya', 1]]) }),
    );

    expect(result.outcome).toBe('not_assessed');
    expect(result.reasons).toEqual(['missing_input:open_flame']);
  });

  it('never reads an unanswered question as a no', () => {
    // The condition asks about an answer the user skipped, and the rule did not declare it
    // as required. "Does not apply" would be a finding about a question nobody answered.
    const result = evaluateRule(
      rule({ condition: { op: 'answer_is', question: 'open_flame', value: 'yes' } }),
      inputs(),
    );

    expect(result.outcome).toBe('not_assessed');
    expect(result.reasons).toEqual(['missing_input:open_flame']);
  });

  it('counts what the user confirmed for an at-least condition', () => {
    const condition = { op: 'object_count_at_least', label: 'diya', count: 2 };

    expect(evaluateRule(rule({ condition }), inputs()).outcome).toBe('does_not_apply');
    expect(
      evaluateRule(rule({ condition }), inputs({ labels: new Map<string, number>([['diya', 1]]) })).outcome,
    ).toBe('does_not_apply');
    expect(
      evaluateRule(rule({ condition }), inputs({ labels: new Map<string, number>([['diya', 3]]) })).outcome,
    ).toBe('applies');
  });

  it('refuses an operator it does not know instead of interpreting it', () => {
    // A rule written for a later version must not run as something else today.
    const result = evaluateRule(
      rule({ condition: { op: 'channel_flow', label: 'diya' } }),
      inputs({ labels: new Map<string, number>([['diya', 1]]) }),
    );

    expect(result.outcome).toBe('not_assessed');
    expect(result.reasons).toEqual(['unsupported_operator:channel_flow']);
  });

  it('refuses a malformed condition', () => {
    expect(evaluateRule(rule({ condition: {} }), inputs()).reasons).toEqual(['malformed_condition']);
    expect(evaluateRule(rule({ condition: { op: 'all', conditions: [] } }), inputs()).outcome).toBe(
      'not_assessed',
    );
    expect(
      evaluateRule(rule({ condition: { op: 'object_count_at_least', label: 'diya', count: 0 } }), inputs())
        .reasons,
    ).toEqual(['malformed_condition']);
  });

  it('settles any() on a true child even when a sibling could not be answered', () => {
    const result = evaluateRule(
      rule({
        condition: {
          op: 'any',
          conditions: [
            { op: 'answer_is', question: 'open_flame', value: 'yes' },
            { op: 'object_present', label: 'diya' },
          ],
        },
      }),
      inputs({ labels: new Map<string, number>([['diya', 1]]) }),
    );

    expect(result.outcome).toBe('applies');
  });

  it('settles all() on a false child even when a sibling could not be answered', () => {
    const result = evaluateRule(
      rule({
        condition: {
          op: 'all',
          conditions: [
            { op: 'answer_is', question: 'open_flame', value: 'yes' },
            { op: 'object_present', label: 'bell' },
          ],
        },
      }),
      inputs({ labels: new Map<string, number>([['diya', 1]]) }),
    );

    expect(result.outcome).toBe('does_not_apply');
  });

  it('leaves a negation unknown when what it negates is unknown', () => {
    const result = evaluateRule(
      rule({
        condition: {
          op: 'not',
          condition: { op: 'answer_is', question: 'open_flame', value: 'yes' },
        },
      }),
      inputs(),
    );

    expect(result.outcome).toBe('not_assessed');
    expect(result.reasons).toEqual(['missing_input:open_flame']);
  });

  it('treats a region nobody recorded as unknown and a different one as not applicable', () => {
    const scoped = rule({
      regionScope: 'north_india',
      condition: { op: 'object_present', label: 'diya' },
    });
    const labels = new Map<string, number>([['diya', 1]]);

    expect(evaluateRule(scoped, inputs({ labels })).reasons).toEqual(['region_unknown']);
    expect(evaluateRule(scoped, inputs({ labels, regionScope: 'south_india' })).outcome).toBe(
      'does_not_apply',
    );
    expect(evaluateRule(scoped, inputs({ labels, regionScope: 'north_india' })).outcome).toBe('applies');
  });

  it('refuses a tree beyond its budget rather than walking it', () => {
    let condition: unknown = { op: 'object_present', label: 'diya' };
    for (let index = 0; index < 80; index += 1) {
      condition = { op: 'not', condition };
    }

    const result = evaluateRule(rule({ condition }), inputs());

    expect(result.outcome).toBe('not_assessed');
    expect(result.reasons).toEqual(['condition_too_complex']);
  });

  it('always gives a reason when it cannot answer', () => {
    // The stored evaluation is read by a person later, so "not assessed" with no reason
    // would be a dead end. This is the invariant the schema documents.
    const unanswered = [
      evaluateRule(rule({ traditionIds: ['north_indian'] }), inputs()),
      evaluateRule(rule({ requiredInputs: ['open_flame'] }), inputs()),
      evaluateRule(rule({ condition: { op: 'answer_is', question: 'tradition', value: 'x' } }), inputs()),
      evaluateRule(rule({ condition: { op: 'channel_flow' } }), inputs()),
      evaluateRule(rule({ condition: {} }), inputs()),
      evaluateRule(rule({ regionScope: 'north_india' }), inputs()),
    ];

    for (const result of unanswered) {
      expect(result.outcome).toBe('not_assessed');
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });
});
