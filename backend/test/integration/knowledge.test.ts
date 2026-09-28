import { beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '../../src/shared/db/pool.js';

/**
 * The knowledge base's promises are structural, so they are tested where they live: in the
 * database.
 *
 * Code that is merely careful about not publishing unreviewed guidance can be bypassed by
 * the next writer. These tests exist to show that a rule version cannot reach `published`
 * while any source it cites is unreviewed, that a published version cannot be edited, and
 * that every lifecycle move leaves an audit row — whatever the calling code believes.
 */

async function insertSourceVersion(slug: string, reviewStatus: 'draft' | 'reviewed'): Promise<string> {
  const pool = getPool();
  const source = await pool.query<{ id: string }>(
    `INSERT INTO sources (slug, kind) VALUES ($1, 'book') RETURNING id`,
    [slug],
  );
  const sourceId = source.rows[0]?.id;

  const version = await pool.query<{ id: string }>(
    `INSERT INTO source_versions
       (source_id, version, title, edition_or_section, attribution,
        review_status, reviewer, reviewed_at)
     VALUES ($1, 1, $2, 'chapter 1', 'A named translator', $3, $4, $5)
     RETURNING id`,
    [
      sourceId,
      `Title for ${slug}`,
      reviewStatus,
      reviewStatus === 'reviewed' ? 'reviewer-1' : null,
      reviewStatus === 'reviewed' ? new Date() : null,
    ],
  );

  return version.rows[0]?.id ?? '';
}

async function insertRuleVersion(
  key: string,
  lifecycle: 'draft' | 'reviewed',
  sourceVersionIds: readonly string[],
  explanation: Record<string, string> = { en: 'Explanation', hi: 'व्याख्या' },
): Promise<string> {
  const pool = getPool();
  const rule = await pool.query<{ id: string }>(
    `INSERT INTO rules (key, topic) VALUES ($1, 'practice') RETURNING id`,
    [key],
  );

  const version = await pool.query<{ id: string }>(
    `INSERT INTO rule_versions
       (rule_id, version, category, finding_type, tradition_ids, required_inputs,
        condition, explanation, recommendation, source_version_ids,
        lifecycle_status, reviewer_id, reviewed_at)
     VALUES ($1, 1, 'practice', 'traditional', '{}', '[]'::jsonb, $2::jsonb,
             $3::jsonb, $3::jsonb, $4::uuid[], $5, $6, $7)
     RETURNING id`,
    [
      rule.rows[0]?.id,
      JSON.stringify({ op: 'object_present', label: 'diya' }),
      JSON.stringify(explanation),
      sourceVersionIds,
      lifecycle,
      lifecycle === 'draft' ? null : 'reviewer-1',
      lifecycle === 'draft' ? null : new Date(),
    ],
  );

  return version.rows[0]?.id ?? '';
}

async function lifecycleOf(ruleVersionId: string): Promise<string> {
  const { rows } = await getPool().query<{ lifecycle_status: string }>(
    `SELECT lifecycle_status FROM rule_versions WHERE id = $1`,
    [ruleVersionId],
  );
  return rows[0]?.lifecycle_status ?? '';
}

describe('knowledge base', () => {
  beforeEach(async () => {
    await getPool().query('TRUNCATE rules, sources CASCADE');
  });

  it('publishes a reviewed rule whose sources were reviewed, and records who did it', async () => {
    const source = await insertSourceVersion('grihya-book', 'reviewed');
    const rule = await insertRuleVersion('diya-place', 'reviewed', [source]);

    await getPool().query('SELECT publish_rule_version($1, $2)', [rule, 'reviewer-1']);

    expect(await lifecycleOf(rule)).toBe('published');

    const { rows } = await getPool().query<{
      from_status: string;
      to_status: string;
      actor: string;
    }>('SELECT from_status, to_status, actor FROM rule_lifecycle_events');

    expect(rows).toEqual([{ from_status: 'reviewed', to_status: 'published', actor: 'reviewer-1' }]);
  });

  it('refuses to publish while any cited source is still unreviewed', async () => {
    const reviewed = await insertSourceVersion('reviewed-book', 'reviewed');
    const draft = await insertSourceVersion('unreviewed-book', 'draft');
    const rule = await insertRuleVersion('mixed-sources', 'reviewed', [reviewed, draft]);

    await expect(
      getPool().query('SELECT publish_rule_version($1, $2)', [rule, 'reviewer-1']),
    ).rejects.toThrow(/RULE_PUBLISH_REFUSED/);

    expect(await lifecycleOf(rule)).toBe('reviewed');
  });

  it('refuses to publish a rule that has not been reviewed', async () => {
    const source = await insertSourceVersion('book', 'reviewed');
    const rule = await insertRuleVersion('unreviewed-rule', 'draft', [source]);

    await expect(
      getPool().query('SELECT publish_rule_version($1, $2)', [rule, 'reviewer-1']),
    ).rejects.toThrow(/RULE_PUBLISH_REFUSED/);

    expect(await lifecycleOf(rule)).toBe('draft');
  });

  it('refuses to publish without a named actor', async () => {
    const source = await insertSourceVersion('book', 'reviewed');
    const rule = await insertRuleVersion('anonymous-publish', 'reviewed', [source]);

    await expect(getPool().query('SELECT publish_rule_version($1, $2)', [rule, '   '])).rejects.toThrow(
      /needs a named actor/,
    );
  });

  it('refuses to edit a published version and offers the honest alternative', async () => {
    const source = await insertSourceVersion('book', 'reviewed');
    const rule = await insertRuleVersion('frozen', 'reviewed', [source]);
    await getPool().query('SELECT publish_rule_version($1, $2)', [rule, 'reviewer-1']);

    await expect(
      getPool().query(`UPDATE rule_versions SET condition = $2::jsonb WHERE id = $1`, [
        rule,
        JSON.stringify({ op: 'object_present', label: 'bell' }),
      ]),
    ).rejects.toThrow(/RULE_VERSION_IMMUTABLE/);
  });

  it('refuses a published version that is missing a language or a source', async () => {
    const pool = getPool();
    const source = await insertSourceVersion('book', 'reviewed');
    const rule = await insertRuleVersion('incomplete', 'reviewed', [source], {
      en: 'Explanation only',
    });

    await expect(
      pool.query(
        `UPDATE rule_versions
            SET lifecycle_status = 'published', published_at = now()
          WHERE id = $1`,
        [rule],
      ),
    ).rejects.toThrow(/rule_versions_published_is_complete/);

    // A published rule with nothing to cite fails the same constraint.
    const noSource = await insertRuleVersion('no-source', 'reviewed', []);
    await expect(
      pool.query(
        `UPDATE rule_versions
            SET lifecycle_status = 'published', published_at = now()
          WHERE id = $1`,
        [noSource],
      ),
    ).rejects.toThrow(/rule_versions_published_is_complete/);
  });

  it('retires a published rule with a reason, and keeps its content readable', async () => {
    const source = await insertSourceVersion('book', 'reviewed');
    const rule = await insertRuleVersion('retirable', 'reviewed', [source]);
    await getPool().query('SELECT publish_rule_version($1, $2)', [rule, 'reviewer-1']);

    await getPool().query('SELECT retire_rule_version($1, $2, $3)', [
      rule,
      'reviewer-2',
      'superseded by a corrected edition',
    ]);

    expect(await lifecycleOf(rule)).toBe('retired');

    const { rows } = await getPool().query<{ explanation: Record<string, string> }>(
      `SELECT explanation FROM rule_versions WHERE id = $1`,
      [rule],
    );
    // The advice a past report quoted is still readable after retirement.
    expect(rows[0]?.explanation['en']).toBe('Explanation');

    const { rows: events } = await getPool().query<{ to_status: string; reason: string }>(
      `SELECT to_status, reason FROM rule_lifecycle_events ORDER BY created_at DESC LIMIT 1`,
    );
    expect(events[0]?.to_status).toBe('retired');
    expect(events[0]?.reason).toContain('corrected edition');
  });

  it('refuses to retire a rule that was never in use, and one with no reason', async () => {
    const source = await insertSourceVersion('book', 'reviewed');
    const draft = await insertRuleVersion('still-draft', 'draft', [source]);

    await expect(
      getPool().query('SELECT retire_rule_version($1, $2, $3)', [draft, 'reviewer-1', 'not needed']),
    ).rejects.toThrow(/RULE_RETIRE_REFUSED/);

    const published = await insertRuleVersion('no-reason', 'reviewed', [source]);
    await getPool().query('SELECT publish_rule_version($1, $2)', [published, 'reviewer-1']);

    await expect(
      getPool().query('SELECT retire_rule_version($1, $2, $3)', [published, 'reviewer-1', '  ']),
    ).rejects.toThrow(/needs a reason/);
  });
});
