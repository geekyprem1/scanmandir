# Scan My Mandir

A Flutter app that photographs a home mandir and returns an explainable visual assessment: what is visible, what may be worth reviewing, and what reviewed traditional guidance says — separated from one another, and never presented as a supernatural or spiritual verdict.

Android first. iOS is planned, not scoped.

## Where the project actually stands

The Android core journey works: guest identity, photo capture or gallery import, private upload, vision analysis, user confirmation, and a stored report. My Reports lists completed scans for the owner and opens a saved report. Onboarding and language choice survive app restarts. The backend uses Supabase Auth, PostgreSQL and private Storage; the worker runs the analysis and report stages. See `TASKS.md` for verified build entries and pending tasks.

The report currently shows confirmed objects and observable arrangement findings. Traditional guidance is unavailable until references and rules have been reviewed by a person. The vision evaluation has only four genuine home-mandir photos; the launch labels and detection thresholds remain open. See `docs/vision-v2-evaluation.md`.

Remaining engineering includes offline report cache, scan resume after process death, retake, deletion and retention, reviewed rules, production operations, and Android release validation. Compass and billing scope are still undecided.

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

**Authentication and domain storage exist.** User-facing scan and report reads are authenticated and owner-scoped. New routes that read or write user data must preserve those checks.

**A model may not author a religious rule.** Rules come from reviewed sources through a person. If no approved rule applies, the correct output is the visual observations plus an explicit statement that guidance is unavailable — not a plausible-sounding answer.

**Scaffolding must never look like a result.** Unbuilt screens say so in plain words, and the spike harness stamps `DRY_RUN_FIXTURE` on everything it produces without a real model call.

**Costs and prices in the documents are hypotheses.** The ₹49 figures, the retention periods and the quota limits are all marked as proposed. Check `docs/decisions.md` before treating any of them as settled.
