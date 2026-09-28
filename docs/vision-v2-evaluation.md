# Production prompt v2: repeat evaluation

**Run:** 27 September 2026, `EVAL_RUN=v2-luna`, 20 licensed photos listed in
`spike/vision-eval/photos/SOURCES.md`. Raw records and generated tables are in
`spike/vision-eval/out/v2-luna/` (gitignored). The harness now imports the exact
production prompt, version 2, from `backend/src/modules/vision/prompt.ts`.

This is a repeat on the same small, mostly non-home set used for v1. It checks
whether the revised home-versus-public-space instruction behaves as intended.
It is **not** the representative 50–100-photo evaluation required for P0-05/P0-06.

| Measure | v1 | v2 |
|---|---:|---:|
| Schema-valid responses | 20/20 | 20/20 |
| Provider calls needing retry | 1/20 | 0/20 |
| Known non-home photos rejected by relevance gate | 11/15 | 14/15 |
| Known home photos accepted by relevance gate | 4/4 | 4/4 |
| Blurred image rejected by quality gate | 1/1 | 1/1 |
| Reported objects | 95 | 94 |
| Bounding boxes | 95/95 | 94/94 |
| Contract violations | 1 | 1 |
| Vision-call p95 latency | 2,978 ms | 2,123 ms |
| Estimated mean vision-call cost using configured rates | ₹0.0727 | ₹0.0597 |

The 15 non-home photos include lamps, an outdoor display, carvings, festival
scenes, two temple interiors, and three ordinary living rooms. The blurred copy
is counted separately from both the home and non-home gate denominators. In v2,
the temple sanctum `radhakrishna-03` is correctly rejected, while the temple
complex `radhakrishna-02` is still called a home mandir. The crowded lamp photo
`homem-01` and held thali `thali-01` also changed to non-home. The four actual
home photos remain accepted.

Two visible errors remain: the Lakshmi carving in `lakshmi-01` is again labelled
`vishnu`, and v2 emits `radha` outside the candidate catalog in
`radhakrishna-03`. The backend normalizer handles labels outside the catalog,
but this run is evidence that the prompt and schema alone do not prevent them.

**No v2 precision or recall is claimed.** The v1 verdicts are tied to v1
observation IDs and claims. V2 needs its own human review of the verdict sheets
and missed objects. The launch catalog and thresholds remain open. The existing
photo set has only four home examples and cannot establish performance in the
actual use case.

The requests used `provider.data_collection: "deny"`. [OpenRouter's routing
documentation](https://openrouter.ai/docs/guides/get-started/sovereign-ai)
describes this as excluding providers that collect user data; its separate
`provider.zdr: true` control enforces zero data retention. This run did not set
ZDR, so it does not establish zero retention. That policy choice remains P0-07/D-08.
