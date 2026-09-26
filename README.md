# Scan My Mandir

A Flutter app that photographs a home mandir and returns an explainable visual assessment: what is visible, what may be worth reviewing, and what reviewed traditional guidance says — separated from one another, and never presented as a supernatural or spiritual verdict.

Android first. iOS is planned, not scoped.

## Where the project actually stands

Phase 1 foundation is built and verified. **No product feature exists yet.** There is no camera, no upload, no analysis, no report, no account and no billing.

| Area | State |
|---|---|
| Documents | PRD, architecture, review and task list at v1.3 |
| Decision record | `docs/decisions.md`, 14 entries |
| Backend foundation | Built. API, worker, migrations, durable queue, outbox, storage seam. 54 tests pass |
| Flutter shell | Built. Theme, Hindi/English, routing, controller states, API client. 22 tests pass, debug and release APKs build |
| Vision spike harness | Built and dry-run verified. **Waiting on photos and an API key** |
| Label catalog | Blocked on the spike |
| Knowledge base | Empty. No source has been reviewed |
| Authentication | Does not exist |

## The one thing that matters next

**Run the vision spike.** Whether a model can reliably identify what is in a real home mandir photo is the question the whole product rests on, and it is not answerable from a document. Cost is already known to be negligible — roughly ₹0.10 to ₹0.30 per scan on GPT-6 Luna, and about ₹2 even on the twenty-times-more-expensive Sol — so the open question is recognition quality, not affordability. See `docs/decisions.md` D-04 through D-06.

The harness is ready. It needs 20 to 30 real photos and an OpenRouter key. `spike/vision-eval/README.md` has the photo spread that matters and explains why an easy set produces a falsely optimistic answer.

Read `docs/decisions.md` D-08 before sending any photo: these are pictures of the inside of people's homes, routed to a third-party provider.

## Quick start

Requires Flutter 3.44.8, Node 24, Docker.

```powershell
# Backend
docker compose -f infra/docker-compose.yml up -d
cd backend
npm install
Copy-Item .env.example .env
npm run migrate
npm run dev:api      # separate terminal: npm run dev:worker

# App
cd ..\mobile
flutter pub get
flutter run
```

Settings in the app shows whether the backend is reachable, which is the fastest confirmation that everything is wired.

PostgreSQL uses ports **5442** and **5443** rather than the defaults, because other projects commonly hold 5432 and 5433.

## Repository

```text
Scan_My_Mandir_PRD.md   Product requirements
ARCHITECTURE.md         Implementation architecture
PRD_REVIEW.md           Document review and gap history
TASKS.md                Phased implementation checklist
docs/decisions.md       What is settled, what is proposed, what is open
mobile/                 Flutter app
backend/                Fastify API and analysis worker
contracts/              Shared schemas (mostly blocked on the spike)
knowledge/              Reviewed sources and rules (empty, correctly)
infra/                  Local development containers
spike/vision-eval/      Throwaway harness to measure model quality
```

Each directory has its own README explaining what is there and what is deliberately absent.

## Checks

```powershell
cd backend;  npm run check; npm run test:integration
cd ..\mobile; flutter analyze; flutter test
cd ..\spike\vision-eval; npm run typecheck; npm run eval:dry
```

## Things worth knowing before changing anything

**The backend has no authentication or authorization.** Do not add a route that reads or writes user data before P3-01, P3-04 and P3-07. Every route that exists today is a health probe or a development-only storage endpoint guarded by an HMAC signature and never registered in production.

**No domain schema exists.** Users, scans, media, observations, rules, reports and quota arrive in P3-03. The one migration so far contains only the job queue and outbox.

**A model may not author a religious rule.** Rules come from reviewed sources through a person. If no approved rule applies, the correct output is the visual observations plus an explicit statement that guidance is unavailable — not a plausible-sounding answer.

**Scaffolding must never look like a result.** Unbuilt screens say so in plain words, and the spike harness stamps `DRY_RUN_FIXTURE` on everything it produces without a real model call.

**Costs and prices in the documents are hypotheses.** The ₹49 figures, the retention periods and the quota limits are all marked as proposed. Check `docs/decisions.md` before treating any of them as settled.
