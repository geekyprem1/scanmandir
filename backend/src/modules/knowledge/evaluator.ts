import type { EvaluableRule, EvaluationInputs, EvaluationResult } from './types.js';

/**
 * The rules evaluator (ARCHITECTURE.md section 7, TASKS P6-04/P6-05/P6-08).
 *
 * It reads a stored condition tree and answers `applies`, `does_not_apply` or
 * `not_assessed` with reasons. Three properties matter more than the operators:
 *
 *   * **A missing input is never a false.** An unanswered question, an unnamed tradition
 *     and a region nobody recorded all produce `not_assessed`, because "we did not ask"
 *     and "the answer is no" are different claims about a user's home.
 *   * **Tradition-specific rules do not fire on an unknown tradition.** Not knowing which
 *     tradition a household follows can only ever withhold a tradition-specific finding,
 *     never activate one.
 *   * **Nothing is executed and nothing is guessed.** The operator set is a closed list;
 *     an operator this code does not recognize is refused with a reason rather than
 *     interpreted, so a rule written for a future version cannot quietly run as something
 *     else today.
 */

/** Bounds on a stored tree, so one malformed row cannot cost unbounded work. */
const MAX_CONDITION_NODES = 64;
const MAX_CONDITION_DEPTH = 8;

type Decision =
  | { readonly kind: 'decided'; readonly value: boolean }
  | { readonly kind: 'refused'; readonly reason: string };

function decided(value: boolean): Decision {
  return { kind: 'decided', value };
}

function refused(reason: string): Decision {
  return { kind: 'refused', reason };
}

function isTrue(decision: Decision): boolean {
  return decision.kind === 'decided' && decision.value;
}

export function evaluateRule(rule: EvaluableRule, inputs: EvaluationInputs): EvaluationResult {
  const prerequisite = checkPrerequisites(rule, inputs);
  if (prerequisite !== null) {
    return prerequisite;
  }

  const decision = walk(rule.condition, inputs, 0, {
    remaining: MAX_CONDITION_NODES,
  });

  if (decision.kind === 'refused') {
    return { outcome: 'not_assessed', reasons: [decision.reason] };
  }

  return decision.value ? { outcome: 'applies', reasons: [] } : { outcome: 'does_not_apply', reasons: [] };
}

/**
 * Checks what a rule says it needs before looking at what it asks about.
 *
 * Returns null when the rule may be evaluated at all.
 */
function checkPrerequisites(rule: EvaluableRule, inputs: EvaluationInputs): EvaluationResult | null {
  if (rule.traditionIds.length > 0) {
    if (inputs.traditionIds.length === 0) {
      // The user did not say which tradition their family follows. A tradition-specific
      // rule is withheld rather than applied to a tradition nobody claimed (TASKS P6-08).
      return { outcome: 'not_assessed', reasons: ['tradition_unknown'] };
    }
    const applies = rule.traditionIds.some((tradition) => inputs.traditionIds.includes(tradition));
    if (!applies) {
      return { outcome: 'does_not_apply', reasons: ['tradition_not_selected'] };
    }
  }

  if (rule.regionScope !== null && rule.regionScope !== undefined) {
    if (inputs.regionScope === null) {
      return { outcome: 'not_assessed', reasons: ['region_unknown'] };
    }
    if (inputs.regionScope !== rule.regionScope) {
      return { outcome: 'does_not_apply', reasons: ['region_not_selected'] };
    }
  }

  const missing = rule.requiredInputs.filter((name) => {
    const answer = inputs.answers.get(name);
    return answer === undefined || answer.trim() === '';
  });
  if (missing.length > 0) {
    return {
      outcome: 'not_assessed',
      reasons: missing.map((name) => `missing_input:${name}`),
    };
  }

  return null;
}

function walk(
  node: unknown,
  inputs: EvaluationInputs,
  depth: number,
  budget: { remaining: number },
): Decision {
  if (budget.remaining <= 0 || depth > MAX_CONDITION_DEPTH) {
    return refused('condition_too_complex');
  }
  budget.remaining -= 1;

  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return refused('malformed_condition');
  }
  const record = node as Record<string, unknown>;
  const op = record['op'];
  if (typeof op !== 'string') {
    return refused('malformed_condition');
  }

  switch (op) {
    case 'object_present':
    case 'object_absent': {
      const label = readLabel(record);
      if (label === null) {
        return refused('malformed_condition');
      }
      const present = (inputs.labels.get(label) ?? 0) > 0;
      return decided(op === 'object_present' ? present : !present);
    }

    case 'object_count_at_least': {
      const label = readLabel(record);
      const count = record['count'];
      if (label === null || typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
        return refused('malformed_condition');
      }
      return decided((inputs.labels.get(label) ?? 0) >= count);
    }

    case 'answer_is': {
      const question = record['question'];
      const value = record['value'];
      if (typeof question !== 'string' || question.trim() === '' || typeof value !== 'string') {
        return refused('malformed_condition');
      }
      const answer = inputs.answers.get(question);
      // The answer the rule is about was never given. That is not a "no", and treating it
      // as one would produce a finding about a question the user skipped.
      if (answer === undefined || answer.trim() === '') {
        return refused(`missing_input:${question}`);
      }
      return decided(answer === value);
    }

    case 'all':
    case 'any': {
      const children = record['conditions'];
      if (!Array.isArray(children) || children.length === 0) {
        return refused('malformed_condition');
      }
      const decisions = children.map((child) => walk(child, inputs, depth + 1, budget));

      // A definite answer outranks an unknown sibling: one true child settles `any`, one
      // false child settles `all`, whatever the rest could not be answered.
      if (op === 'all') {
        if (decisions.some((entry) => entry.kind === 'decided' && !entry.value)) {
          return decided(false);
        }
      } else if (decisions.some(isTrue)) {
        return decided(true);
      }

      const refusal = decisions.find((entry) => entry.kind === 'refused');
      if (refusal !== undefined) {
        return refusal;
      }

      return decided(op === 'all' ? decisions.every(isTrue) : false);
    }

    case 'not': {
      const inner = walk(record['condition'], inputs, depth + 1, budget);
      if (inner.kind === 'refused') {
        // Not knowing P does not tell us whether P is false, so the negation is unknown
        // too. Answering "applies" here would be the evaluator inventing a fact.
        return inner;
      }
      return decided(!inner.value);
    }

    default:
      return refused(`unsupported_operator:${op}`);
  }
}

function readLabel(record: Record<string, unknown>): string | null {
  const label = record['label'];
  if (typeof label !== 'string' || label.trim() === '') {
    return null;
  }
  return label;
}
