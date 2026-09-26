# Vision spike results

Generated: 2026-09-26T16:00:03.880Z

## Run

| Field | Value |
|---|---|
| Photos processed | 20 |
| Model requested | openai/gpt-6-luna |
| Upstream models seen | openai/gpt-6-luna |
| Providers seen | OpenAI |
| Response format | json_object |
| Resize | 1024px longest edge |

## Reliability

| Measure | Value |
|---|---|
| Schema-valid responses | 4 of 20 |
| Needed more than one attempt | 17 |
| Contract violations | 0 |
| Reported unusable image | 1 |
| Reported not a home mandir | 3 |

## Latency

| Measure | Milliseconds |
|---|---|
| Mean | 1917 |
| Median | 1751 |
| p95 | 2404 |
| Max | 2855 |

Architecture section 15 sets a provisional p95 target of 30 seconds for the vision stage, measured separately from queue wait.

## Measured cost

Rates applied: $0.1/1M input, $0.5/1M output, $0.01/1M cached input, 5.5% credit fee, ₹95.9/USD. Override these in .env when rates change.

| Measure | Value |
|---|---|
| Mean billed prompt tokens | 4433 |
| Mean billed completion tokens | 3773 |
| Mean cost per scan | $0.002082 / ₹0.2107 |
| Max cost per scan | ₹0.5969 |
| Projected 1,000 scans | ₹210.65 |

Token counts are summed across every attempt, including responses rejected by schema validation, because a provider bills for those too. If the model emits reasoning tokens they are included in the billed completion count.

This is the vision call only. It excludes fixed infrastructure, storage, egress, and store fees — see docs/decisions.md D-07.

## What was detected

| Measure | Value |
|---|---|
| Total objects | 0 |
| Objects per usable photo | 0.0 |
| With a bounding box | 0 of 0 |
| Flagged verification_required | 0 of 0 |
| Group depictions | 0 |
| Distinct labels used | 0 |
| Labels outside candidate catalog | none |

Bounding box availability decides whether the detected-items screen can show overlays at all (architecture section 7).

### Self-reported confidence spread

| Bucket | Objects |
|---|---|
| below 0.4 | 0 |
| 0.4 to 0.7 | 0 |
| 0.7 to 0.9 | 0 |
| 0.9 and above | 0 |

These are raw model numbers. They are not calibrated probabilities and must not gate recommendations until checked against the scored ground truth (PRD section 10).

### Label frequency

| Label | Count |
|---|---|

## Still required from you

This harness cannot judge correctness. Only you know what is actually in these photos.

1. Fill in `scoring-sheet.csv` — mark each detected object correct or wrong, and give the real label when wrong.
2. Fill in `missed-objects.csv` — list objects present in a photo that the model never reported. Without this there is no recall figure.
3. Only then decide the launch label catalog (P0-06) and the acceptance thresholds (P0-08).
