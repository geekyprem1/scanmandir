# Scan My Mandir — Decision Record

**Started:** 26 September 2026
**Purpose:** Satisfy the Phase 0 completion criterion in `TASKS.md` — implementation-critical dependencies need selected defaults *and a written record of why*.

Every entry carries a status. Do not treat a `Proposed` or `Open` entry as settled just because it is written down.

| Status | Meaning |
|---|---|
| **Decided** | Verified or committed. Changing it requires a new entry, not a silent edit. |
| **Proposed** | Working default so work can continue. Must be confirmed before the listed gate. |
| **Open** | No answer yet. Anything depending on it is blocked. |

---

## D-01 — Mobile framework and SDK versions

**Status:** Decided
**Relates to:** P0-02

Flutter **3.44.8** stable with Dart **3.12.2**, verified locally at `C:\flutter`. `flutter doctor` reports no issues.

Android toolchain verified: SDK **37.0.0**, build-tools 37.0.0, JDK 21 (Android Studio JBR), all licenses accepted. Emulator 36.5.11 is installed but no AVD or physical device is currently connected, so nothing has been run on an Android target yet.

A newer Flutter release exists. Staying on 3.44.8 for now so the pinned version matches what is actually installed and tested. Upgrade deliberately, not incidentally.

**Still open under P0-02:** state management approach, navigation, HTTP client, SQLite, secure storage, camera/gallery, and sensor packages. Each must be checked for current maintenance status before pinning. Resolved package choices are in D-12.

## D-02 — Backend runtime

**Status:** Decided
**Relates to:** P0-02, P1-04

Node **v24.16.0** with npm 11.13.0, TypeScript, Fastify modular monolith with a separate worker process, per `ARCHITECTURE.md` section 1.

## D-03 — Local PostgreSQL

**Status:** Decided
**Relates to:** P1-05

`psql` is not installed locally. Docker **29.7.2** is available, so local and CI PostgreSQL runs in a container. This also keeps the backend integration tests (architecture section 16) reproducible without a host database install.

Production PostgreSQL hosting remains **Open** under D-07.

## D-04 — Vision provider candidate

**Status:** Proposed — quality unverified
**Relates to:** P0-05, P0-06
**Must be settled before:** real-photo integration and the privacy notice

Candidate is **OpenRouter** routing to **GPT-6 Luna**, with **GPT-6 Sol** as the escalation path if Luna's recognition quality is insufficient. The adapter pattern in `ARCHITECTURE.md` section 1 means this choice can change without touching the app or report contracts.

Nothing about recognition quality has been tested. Luna is the cost-efficient tier; whether it can distinguish visually similar deities — for example Lakshmi from Saraswati, both seated female forms with overlapping iconography in small home idols — is unknown and is the single most important open question in the project.

### First measurement, 26 September 2026

Run on 20 freely licensed photos (`spike/vision-eval/photos/SOURCES.md`), 1024 px derivatives, temperature 0, `provider.data_collection = deny`, `openai/gpt-6-luna` served by OpenAI. The set is thin on real home mandirs — four of twenty — so this is a first signal, not the recorded evaluation.

**The response format decides whether any of this works.** Same photos, same model, one setting apart:

| | `json_object` | `json_schema` |
|---|---|---|
| Schema-valid responses | 4 of 20 | **20 of 20** |
| Attempts | 3 on 17 photos | 1 on 19 |
| Objects the harness could use | 0 | **95** |
| Measured mean cost per scan | ₹0.2107 | **₹0.0727** |

With `json_object` the model returned JSON that was close but not compliant — it omitted `category` and invented enum values (`garland` for `representation_type`) — so validation rejected nearly everything and the billed retries tripled the cost. **The production adapter must constrain the response with a schema**, not merely ask for JSON.

What the constrained run showed:

- **Bounding boxes are usable**: 95 of 95 objects carried one, so the detected-items overlay is not blocked.
- **The label catalog held**: no label fell outside the candidate set. The model preferred caution — 20 of 95 objects were `unknown_idol` — and deity labels were sparse (ganesha 3, krishna 3, lakshmi, saraswati, durga, vishnu and kartikeya one each). Separating visually similar goddesses is therefore still unproven, and with four home photos this set cannot settle it. P0-06 stays open.
- **Relevance and quality behave**: `looks_like_home_mandir` was true for all four genuine home-shrine photos and false for the three living rooms and all five aarti photos; the synthetic blur was the one image reported unusable. It was also true for three temple photos, so home-versus-temple is a limitation to handle in the prompt or the rules.
- **One contract violation**: a group naming a single member. The adapter needs a normalization rule for that rather than a rejection.
- **Precision and recall do not exist yet.** `out/scoring-sheet.csv` needs a human, and nothing above fixes the launch catalog or the thresholds.

**Status:** Proposed — reliability, latency and cost measured on a small set; recognition quality unscored.

## D-05 — Estimated AI cost per scan

**Status:** Estimate only — not measured
**Relates to:** P0-08

Published rates as of 26 September 2026. GPT-6 Luna launched 22 September and its price was cut roughly 50% on 23 September, so **re-check before committing**.

- GPT-6 Luna: **$0.10 / 1M input tokens**, **$0.50 / 1M output**, cached input $0.01 / 1M.
- GPT-6 Sol: **$2 / 1M input**, **$10 / 1M output** — 20x Luna.
- OpenRouter adds no per-token markup; it charges roughly **5.5%** on card credit top-ups ($0.80 minimum).
- USD/INR basis: **95.9** (25 September 2026).

Sources: [OpenRouter GPT-6 Luna](https://openrouter.ai/openai/gpt-6-luna), [OpenRouter pricing](https://openrouter.ai/pricing), [OpenAI GPT-6 Sol and Luna announcement](https://openai.com/index/introducing-gpt-6-sol-and-luna/), [USD/INR](https://tradingeconomics.com/india/currency). Figures were rephrased from these sources for licensing compliance.

Assumed single vision call on a 1024x1024 normalized derivative (the derivative described in architecture section 6):

| Component | Assumed tokens | Luna cost |
|---|---|---|
| Image, patch-based tokenization | ~1,500 | $0.00015 |
| Prompt: schema plus label catalog | ~1,200 | $0.00012 |
| Output: objects, findings, quality JSON | ~1,200 | $0.00060 |
| **Total per call** | | **~$0.00087 (~₹0.08)** |

With retries and the credit-purchase fee, roughly **₹0.10–0.12 per scan**. Tripling every assumption still lands near **₹0.20**. On Sol the same scan is roughly **₹2**.

Every number above is an assumption. Image tokenization for this specific model was not confirmed from primary documentation, and no call has been made. The spike must replace these with measured token counts from real responses.

One assumption is riskier than the rest: **output tokens.** If the model emits reasoning tokens, billed completion tokens could be several times the 1,200 assumed here, and output is five times the price of input — so that single line dominates the total. The harness records `completion_tokens` as billed per photo rather than estimating, and counts retried attempts, so the measured figure includes both. Do not quote a cost from this table once real numbers exist.

### Measured, 26 September 2026

The first real run replaces those assumptions. Twenty photos, 1024 px derivatives, one model, one setting apart:

| Measure | `json_schema` | `json_object` |
|---|---|---|
| Mean billed prompt tokens | 2,078 | 4,433 |
| Mean billed completion tokens | 1,230 | 3,773 |
| Mean cost per scan | **₹0.0727** | ₹0.2107 |
| Highest single scan | ₹0.3877 | ₹0.5969 |
| Projected 1,000 scans | **₹72.72** | ₹210.65 |

The assumed total was close for one compliant call (~₹0.08 assumed, ₹0.07 measured). What moved the real number was **retries**: in `json_object` mode the same photos cost three times as much, because validation rejected most responses and a rejected response is still billed. Latency measured 2.0 s mean, 3.0 s p95 against the provisional 30 s target for the vision stage (architecture section 15).

Two caveats: one small licensed set, and this is the vision call only — storage, egress and infrastructure sit outside it (D-07).

## D-06 — AI cost is not the binding constraint

**Status:** Decided, following from D-05

At roughly ₹0.10–0.20 per scan against the ₹16 per scan implied by the pricing direction in D-09, model cost is under 1% of revenue per scan. Two consequences:

1. **Select the model on recognition quality, not price.** Even a 20x escalation to Sol stays affordable, so being wrong about Luna is cheap to correct.
2. Earlier reasoning in this project treated per-scan AI cost as a possible blocker. It is not. That reasoning is superseded.

The first real measurement (D-05) came in at **₹0.0727 per scan**, so the margin is wider than assumed — and the same run showed that the bill is driven by retries, not by tokens.

## D-07 — Hosting and fixed infrastructure

**Status:** Proposed — see D-16
**Relates to:** P0-04
**Must be settled before:** infrastructure provisioning

Unresolved: hosting vendor and region, managed PostgreSQL, object storage, secret manager. A proposed stack with costs is in D-16.

This is now understood to be the **dominant cost driver**, not the AI. Managed PostgreSQL, an API container, a worker container, object storage, and a secret manager cost the same whether 10 or 10,000 scans run per month. At low volume the fixed monthly cost per scan can exceed the AI cost by two orders of magnitude. Google Play's service fee is also a far larger deduction than inference.

Record the operating budget when this is decided.

## D-08 — OpenRouter data routing and privacy

**Status:** Open — launch blocker
**Relates to:** P0-05, P0-07, P0-09

OpenRouter forwards requests to third-party providers. The payload here is a photo of the inside of someone's home, potentially including family members and personal belongings.

`Scan_My_Mandir_PRD.md` section 28 forbids using customer photos for model training without explicit consent, and `ARCHITECTURE.md` section 1 requires checking a vendor's data handling before integration.

Required before any real user photo is sent:

- Configure OpenRouter's provider data policy to exclude providers that train on submitted data.
- Determine which providers can receive an image and what each retains.
- Disclose the routing and retention accurately in the privacy notice.
- Confirm that provider-side deletion is separate from our own object deletion, as architecture section 12 already states.

Spike photos must be ones we own or have permission to use, and must not be treated as production user data.

## D-09 — Pricing direction

**Status:** Proposed — not yet in the PRD
**Relates to:** P0-01, P10-01
**Must be settled before:** billing activation

Direction under consideration is a **scan pack** rather than a subscription: approximately **₹49 for 3 scans** (~₹16 per scan gross, ~₹14 net after Google Play's fee, which should be confirmed rather than assumed).

Rationale: mandir scanning is inherently low-frequency, so recurring subscription demand is doubtful. `PRD_REVIEW.md` already recommended comparing a pack against a subscription. A pack also caps downside — a heavy user cannot consume unlimited paid inference.

`Scan_My_Mandir_PRD.md` section 30 still documents the original ₹49–99/month subscription hypothesis. **Do not change the PRD until the three questions below are answered**, because section 30, section 32, and architecture section 13 must move together.

1. Free tier size. It is currently 3 scans/month, which collides directly with a paid 3-scan pack — a patient user would simply wait for the reset. Free must shrink, or the paid product must sell report depth rather than scan count.
2. Does the pack sell scans, report depth, or both? Both means two products — consumable credits plus a non-consumable unlock — and `quota_ledger` versus `entitlements` must be designed accordingly.
3. Do purchased credits expire? Expiry complicates accounting and refunds.

Whichever model is chosen, safety findings and basic source attribution stay outside the paywall per PRD sections 30 and 32.

## D-10 — Quota reset timezone

**Status:** Proposed
**Relates to:** P0-10, P10-01

Quota periods reset on calendar-month boundaries in **Asia/Kolkata**, fixed in server configuration, so the displayed reset date matches the India-first audience's local month. Period boundaries are stored on each reservation and never derived from a device clock. Already reflected in PRD section 30 and architecture sections 13 and 18.

## D-11 — Supported label catalog

**Status:** Open — blocks P1-06
**Relates to:** P0-06

The launch label catalog cannot be fixed before the spike. PRD section 10 lists 22 candidate deity categories; how many are reliably recognizable is unknown.

This is not a cosmetic list. It propagates into `contracts/`, the `observations.label` column, rule conditions, and Hindi/English display strings. Building those around 22 labels and then cutting to 8 is expensive rework, so **P1-06 stays pending** while the rest of Phase 1 proceeds.

---

## D-12 — Flutter package choices

**Status:** Decided for the packages listed; the rest remain open
**Relates to:** P0-02

Pinned exactly rather than with caret ranges, so builds are reproducible across machines and CI:

| Package | Version | Why |
|---|---|---|
| `flutter_riverpod` | 3.4.3 | One state-management approach throughout, per architecture section 4. Chosen over Bloc for less ceremony per controller, and over plain `ChangeNotifier` because the scan lifecycle involves dependent async state where provider overrides make testing straightforward. |
| `go_router` | 17.5.0 | Declarative routing. The scan journey is a sequence of routes rather than states inside one widget, so Android back behaviour and process death stay predictable. |
| `intl` | 0.20.2 | Pinned to what `flutter_localizations` requires under Flutter 3.44.8. A newer 0.20.3 exists but does not resolve. |
| `flutter_secure_storage` | 11.2.0 | Keystore-backed storage behind the existing `SecureCredentialStore` interface. Session tokens must never reach shared preferences or the SQLite cache (architecture section 4), and the Supabase session plus its PKCE verifier are redirected here. |
| `supabase_flutter` | 2.17.2 | The identity client decided in D-15. Initialized with the project URL and publishable key only; the service-role key never ships in the app. |

Localization uses the SDK's own `gen_l10n` with `.arb` files rather than a third-party package.

Still open: HTTP client package, SQLite, camera/gallery, and sensors. Phase 1 uses `dart:io` behind a transport interface, so adopting a package later cannot reach feature code. Interfaces for the remaining platform capabilities already exist in `mobile/lib/core/platform/`; `SecureCredentialStore` is the first of them with an implementation behind it.

Newer major versions exist for some of these — `go_router` 18, for example. Upgrade deliberately, not incidentally.

## D-13 — Local PostgreSQL ports

**Status:** Decided
**Relates to:** P1-05

Development uses **5442** and integration tests use **5443**, not the defaults. Other projects on this machine already hold 5432 and 5433, and `docker compose up` failed on the collision. Both are bound to loopback only. CI overrides the test database with `TEST_DATABASE_URL`.

## D-14 — Android application ID

**Status:** Decided; confirm before the first upload
**Relates to:** P12-01

`com.scanmymandir.app`, with `.debug` appended for debug builds so a debug and a release build can sit on one device. The Kotlin namespace stays as generated, `com.scanmymandir.scan_my_mandir`; it does not need to equal the application ID.

An application ID cannot be changed once published to Play, so P12-01 must confirm it before the first upload.

## D-15 — Identity provider and account upgrade

**Status:** Decided — confirmed 26 September 2026
**Relates to:** P0-03, P3-01, P3-02

Supabase Auth, in a project pinned to the Mumbai region (D-16). The provider and the upgrade methods below are now committed; changing them requires a new entry.

Why it fits the journey rather than fighting it:

- **Anonymous guests are first-class.** `signInAnonymously` issues a real session and JWT with an `is_anonymous` claim, so the first scan needs no account (PRD section 7) without inventing a parallel guest-token scheme.
- **Upgrade preserves history.** Adding and verifying an email converts the anonymous user in place, and an OAuth identity links via `linkIdentity`; the user id does not change, so owned records keep pointing at the same person (P3-02).
- **Verification stays ours.** Asymmetric signing keys (ES256) publish a JWKS endpoint, so the Fastify backend verifies tokens locally with cached public keys and survives key rotation without redeploying (P3-01).

MVP upgrade methods: **Google Sign-In first** — native on Android, no per-message cost, no telecom compliance — and **email magic link second**. **Phone OTP is deliberately deferred**: sending OTP SMS in India requires TRAI DLT registration (entity, sender header, approved content templates), which is a compliance project the MVP does not need. Supabase phone auth can be added later without changing the account model or the user ids.

Notes that must survive implementation:

- The service-role key never leaves the server; the app ships only the publishable/anon key.
- Anonymous sign-in is an abuse surface: enable CAPTCHA on it, and pair it with the P3-07 rate limits and the quota ledger.
- Linking an anonymous user to an **existing** account is a conflict case, not an automatic merge. Resolve it with an explicit rule (P3-02 forbids merging unverified identities silently).

Alternatives considered:

- **Firebase Auth** — equally capable anonymous accounts and credential linking, but brings no Postgres or object storage, and its free tier was tightened in 2026. Kept as the fallback if Google's stack is preferred.
- **Clerk / Auth0** — designed around permanent accounts first; guests are not a first-class concept.
- **Self-hosted (GoTrue or a custom OTP service)** — full control, but we would own the PII handling and the SMS compliance path ourselves. Not worth it at this size.

Not yet done: nothing has been integrated, no project exists yet, and current pricing/limits must be re-checked at provisioning time (free projects pause when inactive, so production needs the paid plan).

## D-16 — Hosting, database, storage, and secrets

**Status:** Proposed — Supabase confirmed for database, Auth and Storage (D-15); the container host still needs confirmation before provisioning
**Relates to:** P0-04, P11-01

Supabase is settled for PostgreSQL, Auth and object storage in Mumbai. What remains proposed is where the API and worker containers run.

1. **Supabase Pro, Mumbai (`ap-south-1`)** — PostgreSQL, Auth (D-15), and private object storage with signed URLs; the region choice decides where the data physically lives, which fits the India-first audience and the DPDP conversation (P0-09).
2. **DigitalOcean App Platform, Bangalore (`BLR1`)** — the two long-running containers (API and worker) from one image with different commands, behind managed TLS, with encrypted environment variables as the MVP's secret store. App Platform is available in BLR; **Fly.io has no India region** (closest is Singapore), which rules it out for an India-first launch; Railway and Render have no India regions either.

Rough fixed cost: about **$25/mo** (Supabase Pro) + **$10–15/mo** (two small containers) before the domain and Play Store fees. Fixed monthly cost, not per-scan cost, stays the dominant line — D-07's original point, unchanged.

Required before provisioning, not yet built:

- A **production Dockerfile for the backend** — none exists; API and worker share an image and differ by command.
- A deploy path from GitHub (where CI already runs).
- A decision, easy to reverse, on whether the worker runs as a second App Platform service (recommended) or as a scheduled process.

Alternatives considered:

- **All-in on AWS `ap-south-1`** — most control, most operations (ECS/RDS/S3/Secrets Manager), and no identity product that treats guests as first-class.
- **GCP `asia-south1`** — Cloud Run + Cloud SQL + GCS + Secret Manager + Identity Platform is a coherent single-vendor India stack; heavier setup, and a polling worker needs a minimum instance, which erases most of the scale-to-zero saving.
- **DigitalOcean for everything** (managed PostgreSQL and Spaces in BLR) — viable and single-vendor, but identity then needs a second provider anyway; Supabase keeps database, auth, and storage in one console.
- **Fly.io / Railway / Render** — no India region.

Verify before committing: current Supabase Pro limits (database size, storage, egress) and current App Platform BLR pricing. Both change.

Known behaviour when connecting a Node client: the pooler's certificate chain is not in Node's default trust store, so a development connection string needs `?sslmode=no-verify` (still encrypted, identity unverified) or a pinned CA. P11-01 pins Supabase's CA through `NODE_EXTRA_CA_CERTS` and uses `sslmode=verify-full` for deployed environments.

Storage is live as well: the backend's Supabase driver creates the private `mandir-media` bucket on first use with the configured size and content-type limits, clients upload through short-lived signed URLs rather than through our API, and the backend writes, pins and deletes with the server-only secret key. Tests pin the local driver so they can never touch a real bucket.

## D-17 Derivative contract: what the vision stage is allowed to see

**Proposed.** The worker prepares one derivative per image revision and every analysis stage reads that, never the original upload.

- Long edge bounded to 1024 px (`IMAGE_DERIVATIVE_MAX_EDGE`), JPEG quality 85, never enlarged.
- The stored original stays pinned and immutable; the derivative is a separate `media_objects` row, so the analysis input is auditable and reproducible per revision.
- EXIF orientation is applied and metadata is dropped. A photo's GPS coordinates therefore never reach the provider even though the original keeps them (relevant to D-08 and P0-09).
- Decode budget of 40 megapixels (`IMAGE_MAX_INPUT_PIXELS`). A file beyond it is refused as unusable rather than decoded, so a decompression bomb cannot exhaust worker memory.
- A file that cannot be decoded is refused before any paid provider call, becomes `needs_retake`, and releases the allowance — the user is not charged for a photo we could not read.

Why this shape: a bounded, upright, metadata-free derivative is what makes per-scan cost predictable and keeps D-08's data minimalization claim true. The open half is quality: 1024 px may be too coarse for small attributes (material, hidden damage, jewellery detail), and the vision evaluation (P0-05, D-04) is what should settle it. Until then it is a working default, not a measured one.

## D-18 Capture: the system camera and picker, not an in-app viewfinder

**Decided for launch.** Capture uses `image_picker`, which hands off to the system camera app and the Android photo picker, rather than the `camera` package's in-app preview.

- The app declares no camera permission at all. The system camera app owns that consent, so a refusal is the system's to explain and this app never holds a permission it does not use. A device with no camera stays installable: the camera feature is declared optional and the gallery path works.
- The gallery fallback P4-02 asks for is not extra work here — it is the other button on the same screen.
- The boundary is `core/platform/media_picker.dart`, so the picker is fakeable in tests and an in-app viewfinder with preview and crop (the rest of P4-01) can arrive later without the scan flow changing.
- What this costs, stated plainly: no framing guidance, no crop before upload, and the photo arrives re-encoded by the picker (quality 90), so the bytes we store are not bit-identical to what the camera produced. Acceptable while the vision stage only needs a bounded, upright derivative (D-17). If evaluation shows small details matter, in-app capture with a lossless path is the follow-up.

## Open Phase 0 items

| Task | Blocking | Entry |
|---|---|---|
| P0-01 | Launch scope confirmation | D-09 |
| P0-02 | Package pinning beyond SDK | D-01 |
| P0-03 | Identity provider | D-15 (decided) |
| P0-04 | Hosting, storage, secrets, budget | D-16 (proposed) |
| P0-05 | Vision provider quality and data handling | D-04, D-08 |
| P0-06 | Label catalog, traditions, source reviewers | D-11 |
| P0-07 | Retention, save-photo, recovery messaging | not started |
| P0-08 | Measured quality, latency, cost thresholds | D-05 |
| P0-09 | Data-protection obligations, legal review | D-08 |
| P0-10 | Quota timezone, rejected-upload handling | D-10 |

## What has not been done

No code has been run against a vision provider. No recognition quality, latency, or cost has been measured. No vendor has been contracted, no religious source has been reviewed or approved, and no legal review has taken place. Every figure in D-05 is an estimate derived from published rates, not an observation.
