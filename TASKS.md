# Scan My Mandir — Implementation Tasks

**Version:** 1.17  
**Updated:** 26 September 2026  
**Stack:** Flutter/Dart, TypeScript/Fastify, PostgreSQL, private object storage  
**Release target:** Android first; iOS later

## How to use this checklist

- Product requirements: [PRD](Scan_My_Mandir_PRD.md).
- Implementation contracts and proposed defaults: [Architecture](ARCHITECTURE.md).
- Open product gaps: [PRD review](PRD_REVIEW.md).
- `[ ]` means pending; `[x]` means completed with evidence. No implementation is marked complete merely because it is documented.
- Work in dependency order. Record a blocked task's missing input next to its ID and continue independent tasks.
- Close a phase only when its completion criteria are satisfied. Validation tasks below are planned work, not checks already performed.
- Android is the MVP target. iOS, commerce, consultation, and whole-house analysis are outside the current release.

## Current status

- [x] DOC-01 — Product name set to **Scan My Mandir**.
- [x] DOC-02 — PRD updated for Flutter/Dart.
- [x] DOC-03 — Architecture written and aligned with Flutter.
- [x] DOC-04 — Implementation checklist created.
- [x] DOC-05 — v1.3 gap closure: report localization, disclaimer surface, rejected-upload handling, automated test harness, data-protection obligations, and quota reset timezone.
- [x] DOC-06 — Identity provider decided (P0-03): Supabase Auth, recorded as D-15 in `docs/decisions.md`; hosting research recorded as D-16.
- [x] BUILD-01 — Application implementation started. Phase 1 foundation built and verified; see Phase 1 below and `docs/decisions.md`.
- [x] BUILD-02 — Phase 2 started. P2-01 design system completed: app-owned typography scale, shared loading state, and buttons sized from the scale; 28 Flutter tests pass and `flutter analyze` is clean.
- [x] BUILD-03 — Phase 2 continued. P2-03 onboarding built: language selection, product introduction, and photo privacy summary in one flow, with the disclaimer reachable from it; 33 Flutter tests pass and `flutter analyze` is clean.
- [x] BUILD-04 — Phase 2 continued. P2-05 journey shells built over labelled development fixtures: scan progress, editable detected items, context questions, report overview, finding detail and source detail, each carrying a fixture banner and gated out of production builds; 40 Flutter tests pass and `flutter analyze` is clean.
- [x] BUILD-05 — Phase 2 continued. P2-06 states delivered where a host exists: `EmptyView` for the empty case and `FailureView` mapping every failure kind to bilingual copy with retry decided by retryability; the untranslated retry default in `ErrorView` is gone, and an outdated private-field constructor workaround in `ApiClient` was replaced with the now-supported private named parameter; 45 Flutter tests pass and `flutter analyze` is clean.
- [x] BUILD-06 — Phase 2 continued. P2-07 verified: journey back navigation, background/resume state, doubled system text scale, and semantics for icon-only controls, covered by `mobile/test/widget/accessibility_test.dart` (6 tests); 51 Flutter tests pass and `flutter analyze` is clean.
- [x] BUILD-07 — The app was launched on a real Android target for the first time. The debug APK was installed on the Pixel_4 AVD (Android 14, API 34, x86_64) and the entire fixture journey was walked on the device in Hindi, with a clean `logcat`. "Flutter boots on Android" is no longer an assumption.
- [x] BUILD-08 — Version control and CI are live. The initial commit `9de6df1` (193 files) was pushed to `github.com/geekyprem1/scanmandir`, and the push ran all three CI jobs green on the first attempt. `.gitattributes` pins LF so Windows checkouts cannot break `format:check`.
- [x] BUILD-09 — Phase 3 started. P3-01 server half: Supabase JWT verification against the project's JWKS with an authenticated `GET /me`; the backend is now 71 tests (34 unit, 37 integration against real PostgreSQL) and `npm run check` is clean.
- [x] BUILD-10 — P3-01 server half verified against the live Supabase project (Mumbai). A real anonymous session, created through the project's own auth endpoint, produced a token that `GET /me` accepted — same user id, `isAnonymous: true` — while missing tokens and tokens from unknown keys stay 401 in the documented error shape.
- [x] BUILD-11 — P3-01 app half verified on the emulator. A guest session created against the live project persisted through keystore-backed storage and came back with the same user id after a force-stop and relaunch; the session starts on demand, not at launch. 56 Flutter tests pass and `flutter analyze` is clean.
- [x] BUILD-12 — P3-04/P3-05 foundation: `users` migration, internal-user resolution in the auth guard, and `GET`/`PATCH /v1/me`. Live-verified against the Mumbai project — a real guest token produced a profile whose wire id is an internal UUID distinct from the provider subject, and a language change persisted across requests. Backend is now 74 tests (34 unit, 40 integration) and `npm run check` is clean.

## Milestones and dependencies

| Phase | Deliverable | Depends on |
|---|---|---|
| 0 | Implementation decisions and release boundaries | Existing documents |
| 1 | Flutter/backend foundation | 0 |
| 2 | App shell and localized screens | 1 |
| 3 | Identity, ownership, database | 1 |
| 4 | Capture, upload, scan lifecycle | 2, 3 |
| 5 | Vision observations and confirmation | 4 |
| 6 | Reviewed knowledge base and rules | Start source review after 0; integrate after 3, 5 |
| 7 | Reports and complete core journey | 5, 6 |
| 8 | History, profiles, data deletion | 3, 7 |
| 9 | Direction and Vastu | 6, 7 |
| 10 | Quotas and billing | Quota infrastructure in 4; paid billing after 7 |
| 11 | Operations and release validation | 4–10 as included in release scope |
| 12 | Android launch | 11 and final release approval |

**First vertical slice:** guest → upload → detect → confirm → contextual rules → report → save/delete. Complete this before expanding paid features. This milestone does not remove compass or billing from the PRD; any launch deferral must be recorded explicitly.

## Phase 0 — Resolve implementation choices

- [ ] P0-01 — Confirm Android-first launch scope. Compass and billing are currently included in the public MVP; update PRD and architecture together if explicitly deferred.
- [ ] P0-02 — Select and pin Flutter/Dart SDK, one state-management approach, navigation, HTTP, SQLite, secure-storage, camera/gallery, and sensor integrations after checking maintained platform support. *Partly done: SDK, state management, navigation, localization (D-01, D-12), secure storage and the Supabase client (D-12, D-15) are pinned. SQLite, camera/gallery and sensors are still unchosen; interfaces for them exist in `mobile/lib/core/platform/` with no implementations behind them.*
- [x] P0-03 — Choose managed identity provider and guest-to-account upgrade methods. Decided: **Supabase Auth** (`docs/decisions.md` D-15) — anonymous guests are first-class and upgrade in place, so guest history survives; Google Sign-In and email magic link at MVP; phone OTP deferred behind TRAI DLT registration. Confirmed 26 September 2026.
- [ ] P0-04 — Choose hosting region, PostgreSQL hosting, object storage, and secret management; record operating budget. *Supabase confirmed for PostgreSQL, Auth and object storage in Mumbai (D-15/D-16). Still proposed: the container host — DigitalOcean App Platform in Bangalore — which needs confirmation before provisioning; a production Dockerfile is the missing prerequisite. Budget ≈ $35–40/month fixed before domain and Play fees.*
- [ ] P0-05 — Evaluate vision providers using representative mandir photos; record quality, latency, cost, structured-output support, and data retention. *Harness built and dry-run verified at `spike/vision-eval/`. Blocked on real photos and an API key. Published-rate cost estimate recorded in `docs/decisions.md` D-05; no quality, latency or cost has been measured.*
- [ ] P0-06 — Define supported launch labels, deity-group counting, initial traditions, source reviewers, and publication ownership.
- [ ] P0-07 — Confirm retention periods, save-photo behavior, anonymous-account recovery messaging, and deletion deadlines.
- [ ] P0-08 — Define measurable launch thresholds for detection quality, scan completion, latency, and per-scan cost. Architecture budgets are provisional until validated.
- [ ] P0-09 — Confirm applicable data-protection obligations with qualified legal review, including India's DPDP Act consent notice, named grievance contact, deletion path, and under-18 handling.
- [ ] P0-10 — Decide the quota reset timezone (proposed Asia/Kolkata), the rejected-upload handling path, and whether any human review of user photos is permitted.

**Complete when:** implementation-critical dependencies have selected defaults and a decision record. Source approval may continue during foundation work, but religious findings cannot launch without approved rules.

**Status:** the decision record exists at `docs/decisions.md` with 14 entries, each marked Decided, Proposed or Open. Enough is settled to have built the foundation. The phase is **not** closed: P0-03 through P0-09 remain genuinely unresolved, and P0-05 and P0-06 block Phase 5 and Phase 6 respectively.

## Phase 1 — Repository and project foundation

- [x] P1-01 — Create `mobile/`, `backend/`, `contracts/`, `knowledge/`, `infra/`, and `docs/`. Also `spike/vision-eval/`. Each directory carries a README explaining what is present and what is deliberately absent.
- [x] P1-02 — Scaffold Flutter app with Android application ID, display name, development/staging/production configuration, and isolated platform adapters. Application ID `com.scanmymandir.app` with a `.debug` suffix for debug builds; label "Scan My Mandir"; flavor and API base URL come from `--dart-define` and a non-development build refuses to start without `API_BASE_URL`. Platform capabilities sit behind interfaces in `mobile/lib/core/platform/` with no plugin types crossing into the domain.
- [x] P1-03 — Establish Flutter feature folders with presentation/domain/data boundaries, dependency wiring, navigation, and shared error/state models. Riverpod providers are all overridable for tests; `go_router` route table; `UiState` models loading, content, recoverable error and terminal error as distinct types rather than flags; `FailureKind` maps the backend error codes.
- [x] P1-04 — Scaffold TypeScript/Fastify modular backend with separate API and worker entry points. `src/api/` and `src/worker/` share domain code and run as separate processes. Validated configuration, redacting logger, stable error codes. The 12 module directories from architecture section 5 are reserved; `identity/` now holds the user repository (P3-04/P3-05) and the rest are still empty.
- [x] P1-05 — Configure PostgreSQL migrations, local private object storage integration, durable jobs, and transactional outbox. Forward-only checksummed migrations under an advisory lock; job queue with `SKIP LOCKED` claiming, leases, bounded retry and abandoned-lease recovery; outbox dispatcher; object storage behind an interface with a development filesystem driver using HMAC-signed expiring transfers.
- [ ] P1-06 — Define shared API/vision/report schemas, supported-label catalog, error codes, and schema versions. **Blocked on P0-05/P0-06.** The label catalog cannot be fixed before the vision spike, and it propagates into the database column, rule conditions and display strings. Error codes exist in `backend/src/shared/errors.ts` and `mobile/lib/core/model/failure.dart`; the vision contract exists in `spike/vision-eval/src/schema.ts` with labels marked as candidates. See `contracts/README.md`.
- [x] P1-07 — Add environment examples containing placeholders only; ignore secrets, signing credentials, and generated private data. `backend/.env.example` and `spike/vision-eval/.env.example` hold placeholders only. `.gitignore` covers `.env`, keystores, signing keys, service accounts, `key.properties`, local object storage, generated localization, and the evaluation photo directory.
- [x] P1-08 — Document local startup, configuration, migrations, and environment selection in README. Root, `mobile/`, `backend/`, `spike/vision-eval/`, `contracts/` and `knowledge/` each have one.
- [x] P1-09 — Configure formatting, static analysis, build workflow, and CI secret isolation. Prettier plus `tsc` with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` for the backend; `flutter analyze` with strict casts and inference and `unawaited_futures` as an error for the app. `.github/workflows/ci.yml` has three jobs and references no secrets at all.
- [x] P1-10 — Set up the automated test harness defined in architecture section 16: Dart unit/widget/integration tests, backend unit tests, backend integration tests against a real PostgreSQL instance, and recorded vision-adapter fixtures. Run them in CI from the first feature commit. 54 backend tests (23 unit, 31 integration against real PostgreSQL) and 22 Flutter tests. Vision-adapter fixture caching exists in the spike harness. A full end-to-end app integration test arrives with the first real journey in Phase 4.

**Complete when:** Flutter boots on Android, the API serves a health response, migrations initialize storage, a worker can process an internal job, and the test suite runs in CI.

**Status:** complete. All five completion criteria are verified: the app boots on an Android emulator, the API serves health, migrations initialise storage, a worker processes an internal job, and the test suite now runs green in CI. P1-06 remains unchecked by design — it waits on the vision evaluation (P0-05) and the label catalog (P0-06), not on remaining work in this phase.

**Verified:**

- `GET /health` returns `{"status":"ok"}` and `GET /health/ready` returns `database: ok, storage: ok` over real HTTP, not only through in-process injection.
- An unknown route returns `NOT_FOUND` with a correlation ID and no internal detail.
- `npm run migrate` applied `0001_job_infrastructure.sql` to an empty database.
- An outbox event was dispatched into a job, the worker handler processed it, and the row ended `succeeded` with `attempts = 1`. A second enqueue on the same dedupe key returned `created: false` and produced no second job.
- `npm run check` and `npm run test:integration` pass; `flutter analyze` reports no issues; `flutter test` passes.
- `flutter build apk --debug` and `--release` both succeed. `aapt2` confirms `com.scanmymandir.app` with `INTERNET` in the release APK and `com.scanmymandir.app.debug` in the debug APK.
- Deleting `mobile/lib/l10n/generated/` and running `flutter gen-l10n` regenerates it and analysis still passes, so CI does not depend on generated code being committed.
- `mobile/l10n-untranslated.txt` is empty, so Hindi and English are at parity for the current string set.
- The debug APK was installed and launched on the Pixel_4 AVD (Android 14, API 34, x86_64). Onboarding rendered in English and switched to Hindi on the device with correct Devanagari fallback, and the whole fixture journey — progress, detected items, context questions, report overview, finding detail, source detail — was walked there. `logcat` stayed clean: no Flutter exceptions and no overflow reports. "Flutter boots on Android" is now proven on a target, not only by packaging.
- CI has now run for real. The repository was initialised and the first commit pushed to `github.com/geekyprem1/scanmandir`; the push triggered all three jobs and every one finished green on the first attempt — backend (format, typecheck, unit tests and PostgreSQL integration tests), Flutter app (generate, analyze, test, debug APK build) and the vision spike harness. Run `36237838109`. The workflow is written *and* proven.

**Not verified:**

- P1-06 is open by design, downstream of the vision evaluation (P0-05) and the label catalog (P0-06). It is the only Phase 1 item still unchecked.

## Phase 2 — Flutter shell and user experience

- [x] P2-01 — Define theme, typography, spacing, accessible contrast, and reusable widgets for cards, buttons, status chips, errors, and loading states. Typography lives in `app_typography.dart`: all 15 Material roles carry explicit size, weight, line height and leading, tuned for the phone reading range and for Devanagari line boxes, with Latin-only letter tracking removed; a widget test reads the theme through `Theme.of` in both brightnesses so the locale's script-category geometry merge cannot silently replace the scale. Spacing is the `Insets` scale; contrast comes from the seeded `ColorScheme` rather than hand-picked colours. Widgets: `ActionCard`, `StatusChip`, `ErrorView`, `NotImplementedView`, and new `LoadingView`, whose required label names the work in progress and is announced to assistive technology exactly once. Buttons take `labelLarge` from the scale — filled 52dp, outlined and text 48dp — instead of a hard-coded size. Covered by `mobile/test/widget/design_system_test.dart`.
- [ ] P2-02 — Implement Hindi/English localization resources and persist language preference. *Partly done: `.arb` resources for both languages with parity, switchable at runtime from Settings. The preference is held in memory only — persistence needs the storage choice from P0-02.*
- [x] P2-03 — Build onboarding with product explanation and photo privacy summary. One flow, three steps in PRD section 7.1 order: language selection, product introduction, then the photo privacy summary. The privacy wording (and its Hindi translation) states only what is decided today — the photo is used for analysis, is not used for model training without explicit consent, is deletable, and permissions are requested at point of use — and must be reconciled with the confirmed provider routing, retention and legal review (D-08, P0-07, P0-09) before launch. Completion is held in memory until the P0-02 storage decision, so every launch currently opens the flow; `onboarding_test.dart` starts the real app with no override to prove that first-launch behaviour, and `app_shell_test.dart` overrides the flag to start past it. Disclaimer reachable from the last step (P2-08) and the flow completes onto Home.
- [ ] P2-04 — Build Home with Scan My Mandir, Upload Photo, Reports, profile, and settings navigation; hide features not implemented in the release. *Partly done: Home renders all five actions, and unbuilt ones are hidden when the flavor is production. The scan destination now opens the P2-05 shells in development builds; Upload Photo, My Reports, and Mandir Profile remain labelled placeholders.*
- [x] P2-05 — Build scan progress, editable detected-items, context, report overview, finding detail, and source detail screen shells. Six shells over explicitly labelled development fixtures (`features/scan/development/journey_fixture.dart`, `features/report/development/report_fixture.dart`): progress stages from PRD section 34, confirm/remove/add on detected items, context questions that all carry an explicit skip or unsure option, report sections in PRD section 19 order with safety first and the PRD section 20 statuses, the PRD section 21 explainability blocks on finding detail, and source metadata marked as an unreviewed placeholder (P6-02). Every fixture screen carries a `FixtureNotice` banner, and the router redirects all fixture routes to Home when the flavor is production, so fixture output cannot be reached at all, including by deep link. Fixture wording — tradition options, item labels — stays illustrative until P0-06 settles. Covered by `mobile/test/widget/journey_test.dart` (7 tests: the forward walk, item editing, finding and source detail, a Hindi walk, and the production guard).
- [ ] P2-06 — Add empty, offline, denied-permission, recoverable-error, and expired-session states. *Partly done: the states with a host are built and tested. `EmptyView` presents the empty case and is wired to the detected-items list when every item is removed, with the add action as the way out. `FailureView` renders a `Failure` using reviewed bilingual wording for every `FailureKind` and shows a retry only when `Failure.isRetryable`, which carries offline, timeout, recoverable-error, expired-session, quota, retake, conflict and expired-image copy in one place; the finding and source detail screens use it for missing ids, and `ErrorView` no longer has an English retry default to fall back on. Still without a host: camera/gallery permission denial (arrives with the Phase 4 capture surface — `PhotoSourceDenial` already models the reasons and P4-02 owns the gallery fallback), the sign-in action an expired session needs (identity, P3-01), and the empty history state (stored reports, P8-01).*
- [x] P2-07 — Support system back navigation, app resume, large text, and semantic labels. System back is verified end to end: a test walks the whole fixture journey and pops back screen by screen to Home, asserting each screen by type rather than by top-of-list content, because a popped-to list keeps its scroll offset. Resume is verified by a lifecycle test — the app is paused and resumed mid-flow and keeps both its place and its edits; reconciling in-progress work on foreground stays P4-07's own task. Large text was audited at a doubled system scale across home, onboarding, settings and every journey screen, with the test first proving the scale actually applied before trusting the layout; nothing overflows, which the scroll-friendly screens and wrapping layouts already made true. Semantic labels were audited: icon-only controls carry their purpose as IconButton tooltips, asserted against the real semantics node data; the shared loading state announces its label exactly once (P2-01) and the onboarding page dots are excluded as decorative.
- [ ] P2-08 — Add a terms and disclaimer surface reachable from onboarding, Settings, and every report, stating that guidance is informational, varies by tradition, and does not replace a priest or professional advice. *Partly done: the screen exists in both languages and is reachable from Settings and from the last onboarding step (P2-03). Reports do not exist yet, so that third entry point is still missing.*
- [ ] P2-09 — Support changing language after content exists; re-render stored reports in the selected language without regeneration. *Partly done: switching language re-renders the current screen without resetting navigation, covered by a widget test. Stored reports do not exist yet, so the report half is untested.*

**Complete when:** the complete journey can be navigated using explicitly identified development fixtures in both languages. Fixture output must never appear as a real completed scan.

## Phase 3 — Identity, ownership, and persistence

- [x] P3-01 — Integrate anonymous identity sessions and server token verification. Server: Supabase access tokens are verified locally against the project's JWKS — asymmetric algorithms only, with the symmetric algorithm refused outright — every failure is UNAUTHENTICATED in the documented error shape, and `GET /me` returns the caller's id and guest status; live-verified against the Mumbai project (BUILD-10). App: `supabase_flutter` 2.17.2 initializes with the project URL and publishable key only, and the session and its PKCE verifier persist through `flutter_secure_storage` 11.2.0 behind the existing `SecureCredentialStore` boundary — never shared preferences (ARCHITECTURE.md section 4). A guest session starts on demand rather than at launch, and the Settings tile shows its state with the PRD section 7 warning; on the emulator the session survived a force-stop and relaunch with the same user id (BUILD-11).
- [ ] P3-02 — Implement account upgrade/linking without losing guest history or merging unverified identities.
- [ ] P3-03 — Add migrations for users, mandirs, scans, media, observations, confirmed items, context, reports, findings, sources, rule versions, jobs/outbox, quota ledger, entitlements, feedback, deletion requests, and audit events. *Jobs and outbox are done in `0001_job_infrastructure.sql`, and `users` is done in `0002_users.sql` — the one domain table that does not depend on the label catalog. The rest stay outstanding and deliberately wait on P0-06.*
- [ ] P3-04 — Enforce user ownership for every scan, image, mandir, finding, and report endpoint. *Partly done: the foundation is in place. Every verified token resolves to a stable internal user id (`users.id`, migration `0002`) and the guard attaches it to the request, so handlers compare ownership against an internal id and never against the provider subject. No endpoint reads an owned record yet, so there is nothing to enforce against: the per-resource checks land with the resources — scans and media in Phase 4, mandirs and history in Phase 8.*
- [x] P3-05 — Implement `/me` profile/preferences and secure Flutter credential storage. `GET /v1/me` returns the caller's profile (internal id, guest status, language, createdAt) and `PATCH /v1/me` updates supported preferences, rejecting unsupported values and unknown keys with `VALIDATION_FAILED`. The user row is provisioned on the first authenticated request and reused afterwards; a guest upgrade keeps the same internal id. Flutter credential storage landed with P3-01 (`flutter_secure_storage` behind `SecureCredentialStore`). `DELETE /me` stays P8-05, and quota/entitlements join the profile in P10. Live-verified against the Mumbai project (BUILD-12); covered by `backend/test/integration/identity.test.ts`.
- [ ] P3-06 — Set up SQLite report/profile cache and in-progress scan persistence; define logout cleanup.
- [ ] P3-07 — Add request validation, rate limits, correlation IDs, and redacted error/log handling.
- [ ] P3-08 — Add separate image/input revisions, immutable input snapshots and source versions; pin report provenance to those versions.

**Complete when:** a guest can create owned records, retrieve only their own data, and upgrade identity without losing those records.

## Phase 4 — Capture, upload, and reliable scan lifecycle

- [ ] P4-01 — Implement camera capture, selected-photo gallery import, preview, crop, retake, and continue.
- [ ] P4-02 — Handle permissions at point of use; preserve gallery fallback if camera permission is denied.
- [ ] P4-03 — Implement idempotent scan creation and quota reservation before provider work.
- [ ] P4-04 — Implement constrained signed upload URLs, upload completion, actual-image validation, decode limits, normalization, and metadata removal.
- [ ] P4-05 — Implement scan states from architecture, including `needs_retake`, failed-stage tracking, input revisions, and terminal deletion.
- [ ] P4-06 — Atomically write state and outbox event; implement worker leases, job deduplication, bounded retries, and abandoned-job reconciliation.
- [ ] P4-07 — Persist upload/scan progress; reconcile on foreground/app restart and use OS-backed transfer scheduling where supported.
- [ ] P4-08 — Implement progress polling with bounded backoff and meaningful server stages.
- [ ] P4-09 — Release reservations on unusable input/terminal failure; ensure repeated requests do not reserve or consume twice.
- [ ] P4-10 — Implement retake replacement with new input revision and stale-result invalidation.
- [ ] P4-11 — Pin immutable uploaded input before analysis; reject mutation through reused staging URLs. Add explicit retake API and image-expiry recovery.
- [ ] P4-12 — Reject illegal or clearly out-of-purpose uploads at the validation/quality gate; record the reason, avoid retaining rejected content beyond the defined window, and restrict any human review to an audited role.

**Complete when:** a photo reaches a resumable server job; retry, app closure, duplicate taps, or retake cannot corrupt state or double-charge allowance.

## Phase 5 — Vision and user confirmation

- [ ] P5-01 — Implement provider adapter with server-only credentials, timeouts, schema validation, and bounded transient retries.
- [ ] P5-02 — Implement image quality/relevance gate with clear retake reasons.
- [ ] P5-03 — Normalize supported deity/object labels, representation types, groups, unknowns, and optional evidence boxes.
- [ ] P5-04 — Store immutable observations with model/prompt/schema versions; do not treat raw confidence as calibrated accuracy.
- [ ] P5-05 — Render detected items with confirmation, correction, add, and remove actions; show overlays only when valid localization exists.
- [ ] P5-06 — Capture tradition/context answers with explicit unknown/skip options.
- [ ] P5-07 — Implement atomic confirmation endpoint with expected revision and stale-edit conflict handling.
- [ ] P5-08 — Ensure uncertain damage, dimensions, material, and unseen/missing items do not become unsupported definitive findings.
- [ ] P5-09 — Create consent-appropriate reviewed evaluation fixtures covering groups, framed images, occlusion, dark images, and unrelated uploads.

**Complete when:** users can correct observations, unknowns remain explicit, and downstream work receives a stable confirmed input revision.

## Phase 6 — Reviewed knowledge and deterministic rules

- [ ] P6-01 — Collect actual launch references with title, edition/section or URL, tradition, attribution, and reviewer metadata.
- [ ] P6-02 — Replace illustrative rule placeholders with reviewed launch rules; never publish `verified_reference` placeholders as sources.
- [ ] P6-03 — Implement draft/reviewed/published/retired lifecycle with authorized publication and audit trail.
- [ ] P6-04 — Define restricted condition operators, required inputs, exceptions, applicability, and conflict handling.
- [ ] P6-05 — Implement evaluator outcomes: applies, does_not_apply, and not_assessed with reasons.
- [ ] P6-06 — Implement reviewed Hindi/English explanation and recommendation templates.
- [ ] P6-07 — Keep visual, traditional, Vastu, safety, and verification finding types distinct.
- [ ] P6-08 — Prevent unknown tradition from activating tradition-specific restrictions; missing prerequisites remain unassessed.
- [ ] P6-09 — Implement restricted reviewer tooling and rule-version rollback; approved fixture imports may precede a full admin UI.

**Complete when:** every enabled traditional finding traces to a published reviewed rule version and source; no runtime model response can create or publish rules.

## Phase 7 — Reports and core vertical slice

- [ ] P7-01 — Build report generator using confirmed input revision, observations, rule outcomes, and localized templates.
- [ ] P7-02 — Persist immutable report revisions, evidence links, rule evaluations, source versions, and generation metadata.
- [ ] P7-03 — Prevent deleted scans and stale jobs from publishing results.
- [ ] P7-04 — Render overview, Looks Good, Review, Verify, traditional guidance, and prioritized safety findings.
- [ ] P7-05 — Separate object counts from finding counts; expose observation, explanation, action, uncertainty, and source in detail views.
- [ ] P7-06 — Regenerate after corrections without reusing obsolete findings or consuming a second allowance for the same photo.
- [ ] P7-07 — Keep safety findings and basic attribution accessible on free reports.
- [ ] P7-08 — Add usefulness/issue feedback tied to the exact report revision.
- [ ] P7-09 — Support user-initiated report sharing with a preview and explicit choice of whether to include a saved photo.
- [ ] P7-10 — Persist every supported language for each report revision at generation time; language switching must not create a revision or consume allowance.

**Complete when:** a real photo completes the guest-to-report flow, and displayed traditional guidance is supported by reviewed evidence. No mock analysis is presented as live AI output.

## Phase 8 — History, profiles, and deletion

- [ ] P8-01 — Implement cursor-paginated history, report detail retrieval, and offline cache timestamps.
- [ ] P8-02 — Implement mandir profile creation/update/deletion and editable tradition/context.
- [ ] P8-03 — Ask for confirmation before reusing stored direction/context on a new scan.
- [ ] P8-04 — Implement optional saved thumbnail consent; use text-only history otherwise.
- [ ] P8-05 — Implement scan/account deletion: immediate access revocation, job cancellation/tombstone checks, storage/cache cleanup, and completion status.
- [ ] P8-06 — Implement retention cleanup for originals, derivatives, abandoned uploads, logs, and configured backups.
- [ ] P8-07 — Define profile deletion semantics separately from deleting associated scans.
- [ ] P8-08 — Implement deletion ledger replay for backup restoration and document provider-side retention limitations.
- [ ] P8-09 — Define correction after photo expiry using retained observations; disable missing-image overlays and reconcile deleted caches when offline devices reconnect.

**Complete when:** history survives permitted session recovery, offline copies are clearly identified, and deletion cannot be undone by a late worker or restored backup.

## Phase 9 — Direction and Vastu

- [ ] P9-01 — Collect worshipper facing, idol facing, and mandir location in home as separate concepts.
- [ ] P9-02 — Implement manual cardinal-direction input and unknown/skip states.
- [ ] P9-03 — Implement Flutter compass adapter with holding instructions, calibration guidance, quality status, and unavailable-sensor fallback.
- [ ] P9-04 — Store measurement kind, source, heading/cardinal value, confirmation time, and accuracy status.
- [ ] P9-05 — Evaluate Vastu only after its specific required inputs are collected and relevant rules are approved.
- [ ] P9-06 — Label findings as traditional guidance and preserve the visual report when direction cannot be assessed.

**Complete when:** compass heading is never silently treated as home location or idol facing, and missing direction produces no fabricated assessment.

## Phase 10 — Quotas and premium

- [ ] P10-01 — Finalize configurable free/premium allowances, reset period, reset timezone (proposed Asia/Kolkata), cost budget, and pricing experiment.
- [ ] P10-02 — Finish reserve/consume/release accounting and quota display with reset date; first successful report consumes once.
- [ ] P10-03 — Implement Flutter Android purchase adapter, paywall, cancellation/pending/error states, and restoration.
- [ ] P10-04 — Implement server purchase verification, event authentication/deduplication, entitlement expiry, refunds/revocations, and reconciliation.
- [ ] P10-05 — Enforce premium permissions on the server; define expired-subscription access to historical reports.
- [ ] P10-06 — Confirm failed scans release allowance and same-photo correction does not consume another scan; apply independent abuse limits.
- [ ] P10-07 — Keep safety and necessary source attribution outside premium restrictions.
- [ ] P10-08 — Implement reservation expiry/renewal, cross-month accounting and reacquisition after release; bind purchases to verified internal owners.

**Complete when:** paid access is based on verified entitlements, restoration works, and duplicate/out-of-order events cannot produce incorrect access or usage.

## Phase 11 — Operations and release validation

- [ ] P11-01 — Provision separate staging/production API, worker, database, private storage, secrets, and scheduled jobs.
- [ ] P11-02 — Add controlled migrations, compatible mobile API evolution, rollback procedure, and health checks.
- [ ] P11-03 — Add crash reporting and privacy-preserving funnel events: scan started/completed, report viewed, usefulness, and purchase outcome.
- [ ] P11-04 — Monitor queue age, provider latency/failures, malformed output, scan cost, completion, quota mismatch, and deletion backlog.
- [ ] P11-05 — Implement flags to stop new scans, disable a provider/rule/Vastu feature, or pause billing offers while preserving existing reports.
- [ ] P11-06 — Validate detection against the reviewed sample set and agreed launch thresholds; record limitations by supported label.
- [ ] P11-07 — Validate rules, exceptions, unknown inputs, duplicate/group counting, equivalent Hindi/English meaning, and language switching on already stored reports.
- [ ] P11-08 — Validate retries, stale revisions, duplicate jobs, app closure, network loss, retake, and deletion during analysis.
- [ ] P11-09 — Validate cross-user authorization, signed media access, file limits, secret/log redaction, and rate limiting.
- [ ] P11-10 — Validate Android camera/gallery, unavailable compass, permission denial, offline history, and accessibility on representative devices.
- [ ] P11-11 — Validate billing lifecycle if in launch scope, including restoration, refunds, expiry, and event ordering.
- [ ] P11-12 — Exercise backup restoration and deletion replay; record recovery procedure and operational ownership.
- [ ] P11-13 — Compare actual performance/cost with agreed budgets; address failures before launch.

**Complete when:** release-blocking checks have recorded outcomes, unresolved issues have explicit dispositions, and required scope meets the PRD's Definition of Done.

## Phase 12 — Android release

- [ ] P12-01 — Prepare launcher assets, splash, final app name, versioning, signing configuration, and release artifact.
- [ ] P12-02 — Prepare privacy policy, terms and disclaimer, support contact, grievance contact, deletion instructions, store data disclosures, and consent text reflecting actual integrations and the confirmed data-protection obligations from P0-09.
- [ ] P12-03 — Prepare truthful store description and screenshots from the working product.
- [ ] P12-04 — Run internal/closed release review and collect product/recognition feedback.
- [ ] P12-05 — Confirm launch scope, approved rules, retention settings, billing configuration, production budget, and support readiness.
- [ ] P12-06 — Obtain final release approval for the concrete reviewed artifact and publish through the chosen rollout process.
- [ ] P12-07 — Monitor first-release errors, completion, usefulness, cost, and deletion requests; retain a rollback/feature-disable path.

**Complete when:** the approved Android release is available to its intended audience and operational monitoring is active.

## Later backlog — not current release dependencies

- [ ] LATER-01 — iOS release: host configuration, signing, permissions, sensors, lifecycle, billing, and device validation.
- [ ] LATER-02 — More reviewed traditions, labels, and languages.
- [ ] LATER-03 — Hindi voice guidance and personalized puja checklists.
- [ ] LATER-04 — Puja guides, mantra audio, and opt-in reminders.
- [ ] LATER-05 — Expert-reviewed reports and consultation, separately scoped.
- [ ] LATER-06 — Companion website and reviewed educational content.

## Next action

Latest evaluation candidates: GPT-6 Luna via OpenRouter for vision, and ₹49/month versus a ₹49 limited premium-credit pack for pricing. These remain proposals. Under P0-05, run the initial 50–100-photo evaluation and record billed cost including retries/reasoning. Under P10-01, select one offer, finish the free/premium feature matrix, and define report-upgrade and credit/refund behavior before billing work; update public-MVP scope if subscriptions are deferred.

Start **P0-02** and **P1** with Flutter/Dart as the confirmed framework. Select infrastructure and identity before their integrations; source review can proceed independently. The first implementation target is the working core scan journey, followed by the remaining agreed launch scope.

---

**Updated after the Phase 1 build.** One thing now.

**1. Run the vision evaluation (P0-05).** The harness is built and dry-run verified at `spike/vision-eval/`. It resizes to the planned derivative, validates the response against the vision contract, caches every result so a re-run costs nothing, and records billed prompt and completion tokens per photo — so the cost figure it produces includes retries and any reasoning tokens rather than assuming them away.

Two tiers, because they answer different questions:

- **20–30 photos** for the first go/no-go signal, with the spread in `spike/vision-eval/README.md`. An easy set gives a falsely optimistic answer.
- **50–100 photos** for the recorded evaluation that fixes the launch label catalog and the acceptance thresholds.

Read `docs/decisions.md` D-08 before the first real call: these are photos of the inside of people's homes going to a third-party provider, and OpenRouter's provider data policy has to be set first.

The result settles P0-06 and P0-08 and unblocks P1-06, Phase 5 and Phase 6. Cost is already known to be negligible at published rates, so what this actually answers is whether recognition is good enough — the one question the whole product rests on.

**2. Launch the app on an Android device or emulator — done.** The debug APK runs on the Pixel_4 AVD and the whole fixture journey was walked there; see the Phase 1 verification list. A physical-device pass is still P11-10's job.

Phase 2 onward can proceed in parallel, except P1-06 and anything downstream of the label catalog. Source review for Phase 6 is independent, is the longest lead item in the project, and has not started.
