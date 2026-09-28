# Vision spike harness

A throwaway tool, not part of the product. It answers one question the documents cannot:

**Can a vision model reliably identify what is in a real home mandir photo?**

Everything it reports about cost and latency is a by-product. Recognition quality is the point. See `docs/decisions.md` entries D-04, D-05, D-06, D-08 and D-11.

## Setup

```powershell
cd "spike\vision-eval"
npm install
Copy-Item .env.example .env
# then put your OpenRouter key in .env
```

## Verify the pipeline without spending anything

```powershell
npm run eval:dry
```

Runs the whole flow against a canned fixture — no API key, no photos, no cost. Output is stamped `DRY_RUN_FIXTURE` and is not a measurement of any model. Delete `out/raw` before a real run.

To exercise the bounded-retry path and confirm that billed tokens accumulate across rejected responses:

```powershell
$env:DRY_RUN_INVALID='true'; npm run eval:dry; Remove-Item Env:\DRY_RUN_INVALID
```

Every attempt then fails schema validation, so a photo records three attempts and three times the billed tokens. A provider charges for a response it later fails validation on, and the cost figure reflects that.

## Real run

Put photos in `photos/` as `.jpg`, `.jpeg`, `.png` or `.webp`.

Two tiers, because they answer different questions:

- **20–30 photos** for the first go/no-go signal: can the model do this at all?
- **50–100 photos** for the recorded evaluation that fixes the launch label catalog (P0-06) and the acceptance thresholds (P0-08).

Only use photos you own or have explicit permission to use. These become your evaluation set, and they go to a third-party provider — read D-08 first.

Aim for this spread, because an easy set will give a falsely optimistic answer:

| Count | Kind | Tests |
|---|---|---|
| 8-10 | Well lit, clear | Baseline recognition |
| 4-5 | Low light, evening, lit diya | Real conditions |
| 4-5 | Crowded, many idols and items | Counting and occlusion |
| 3-4 | Statue and framed picture together | `representation_type` separation |
| 2-3 | Deity groups: Ram Darbar, Radha-Krishna, Navagraha | Group counting, the PRD section 13 double-count risk |
| 2-3 | Not a mandir at all | Relevance rejection |
| 1-2 | Blurry or badly framed | Quality gate |

Then:

```powershell
npm run eval
```

Results are cached per photo in `out/raw/`. Re-running skips anything already there, so you never pay twice. Use `--force` to redo, `--only=<text>` to filter by filename.

```powershell
npm run eval -- --only=dark
npm run eval -- --force
npm run report      # regenerate reports from cached results
```

The harness imports the current production prompt from `backend/src/modules/vision/prompt.ts`.
Set `EVAL_RUN` to a new name for each prompt/model comparison; its raw responses and
reports go under `out/<name>/`, leaving the original v1 run in `out/` untouched.
Cached records are refused when their prompt version, schema version, model or response
format differs from the current run. The `.env.example` uses `v2-luna`.

## The photo set in `photos/`

`photos/SOURCES.md` records where every photo came from — Commons file, author, licence —
and what each one shows. Two things to know before trusting a run:

- **It is thin on real home mandirs.** Commons has very few. Most of what the searches
  return is temples, carvings, processions and buildings, and all of that was discarded.
  Four photos are genuine home shrines. That is enough for a first go/no-go — can the model
  identify deities and objects at all, does it refuse photos with no mandir in them — and
  not enough to fix the launch label catalog (P0-06) or the acceptance thresholds (P0-08).
- **These photos are not ours.** They are freely licensed and attributed, which is what
  makes them usable here, but they are still other people's photographs going to a
  third-party provider. `DENY_DATA_COLLECTION=true` is the guard for that (D-08); check it
  against OpenRouter's current documentation before a run.

`make-contact-sheet.mjs` renders `out/contact-*.jpg`: a labelled grid of the whole set, so
a human can see what is in it without opening twenty files. Rebuild it with
`node make-contact-sheet.mjs`.

## Output

| File | Contents |
|---|---|
| `out/raw/<photo>.json` | Full record: raw response, tokens, latency, attempts, validation errors |
| `out/summary.md` | Reliability, latency, measured cost, label frequency, confidence spread |
| `out/per-photo.csv` | One row per photo |
| `out/scoring-sheet.csv` | One row per detected object, with the verdict columns `npm run score` fills in |
| `out/missed-objects.csv` | Objects the model never reported. Written by `npm run score`; a report run never overwrites it |
| `out/scoring-summary.md` | Precision, recall, deity-label precision and the per-label table |
| `out/verdict-*.jpg` | Each photo beside the claims made about it, for scoring by eye |

## Scoring

`node make-verdict-sheet.mjs` renders the verdict sheets for `EVAL_RUN`, when set.
`npm run score` applies the
verdicts held in `score.mjs` to those sheets and computes what a person would otherwise add
up by hand: precision, recall and deity-label precision, written to
`out/scoring-summary.md`.

`score.mjs` contains human verdicts for the **original v1 run only** and refuses a named
`EVAL_RUN`. A new run needs a fresh review of its verdict sheets and missed objects before
any precision or recall number can be reported.

The judgement is data in `score.mjs` rather than something the harness infers, because only
a person who has looked at the photo can say whether a claim is true. The conventions are
at the top of that file; the one that matters is `partial`, which covers non-committal
placeholders (`unknown_idol`, `other_object`) and claims that cannot be verified at the
resolution they were scored at. Partial sits outside both sides of precision and counts as
a miss in recall, so an honest "I cannot tell" never inflates a number.

## The part the harness cannot do

It has no idea what is actually in your photos. Precision and recall exist only because a
person scored the sheets; the numbers carry that person's judgement, not a measurement.

Nothing here justifies fixing the launch label catalog (P0-06) or the acceptance thresholds
(P0-08) until the set is large enough to carry them. A high `model_confidence` is not
evidence of correctness — PRD section 10 and architecture section 7 both say so explicitly.

## What to conclude afterwards

- Which of the 22 candidate deity labels in PRD section 10 are actually reliable. That set becomes the launch catalog; the rest stay `unknown`.
- Whether bounding boxes are usable. If not, the detected-items screen ships without overlays.
- Whether visually similar deities are separable. If Lakshmi and Saraswati are routinely confused, the duplicate-representation rules in PRD section 13 cannot ship as designed.
- Whether `openai/gpt-6-luna` is sufficient or the run should be repeated on `openai/gpt-6-sol`. Set `MODEL` and re-run into a clean `out/`.
