# Scan My Mandir — PRD Review

Reviewed: 26 September 2026

## Recheck — v1.4 discussion alignment

Reviewed the current v1.3 PRD and relevant architecture sections after the model/pricing discussion. The Flutter core flow, confirmation before rules, typed direction inputs, and stored Hindi/English report behavior remain suitable for prototype work.

The recent discussion had not been recorded: the PRD contained no Luna/OpenRouter evaluation candidate and listed only subscription pricing. v1.4 adds Luna as the first evaluation candidate, an initial reviewed-photo evaluation plan, and ₹49/month versus a finite ₹49 premium-credit pack as unapproved alternatives. Architecture and tasks carry the same candidate status; subscription scope was not silently removed.

Outstanding before affected implementation or launch: production model acceptance thresholds and results, reviewed religious rules, free/premium feature matrix, selected paid offer/limits, pack lifecycle if selected, infrastructure and retention decisions. The new v1.3 legal/compliance text has not been independently verified by this document review.

Verdict: suitable to begin the Flutter prototype; not a completed production or pricing specification. No model calls, implementation, or paid-offer activation were performed in this review.

## Recheck — v1.3 gap closure

Six gaps identified after the v1.2 recheck are now addressed. `Scan_My_Mandir_PRD.md`, `ARCHITECTURE.md`, and `TASKS.md` are all at v1.3.

- **Report localization.** A report revision now persists content for every supported language at generation time. Switching app language re-renders the stored revision and cannot create a revision or consume a scan.
- **Terms and disclaimer.** A persistent disclaimer surface is required, reachable from onboarding, Settings, and every report. It is screen 20 in the PRD list and a Phase 2 and Phase 12 task.
- **Rejected uploads.** Illegal or clearly out-of-purpose uploads are rejected at the validation/quality gate, with a short retention window for the rejection record and a restricted audited role for any human review of a user photo.
- **Automated tests.** Test layers are defined in architecture section 16 and are a Phase 1 deliverable, not only end-stage manual validation. Duplicate-request, retry, and stale-revision behavior is explicitly called out as untestable by hand.
- **Data-protection obligations.** India's DPDP Act consent notice, grievance contact, deletion path, and under-18 decision are a launch dependency, subject to qualified legal review. The documents do not claim to give legal advice.
- **Quota reset timezone.** Resets use one server-configured timezone with Asia/Kolkata proposed, with period boundaries stored on each reservation and never derived from the device.

Cosmetic fixes: `TASKS.md` version now matches the other documents, Phase 3 task IDs are in sequence, and catalog label IDs are canonically lowercase `snake_case` with display names taken from localization resources.

These are document-level changes only. No code, vendor selection, religious source approval, legal review, or test execution has been performed.

## Recheck — PRD and architecture v1.2

The documents are aligned enough to begin Flutter foundation work. This is a document consistency review, not validation of a running application, current vendor integrations, market demand, or religious sources.

Fixed in the v1.2 recheck:

- Replaced old password-auth/API and database sketches with the architecture's canonical managed-identity and versioned-data contracts.
- Moved confirmation/direction before dependent rule evaluation; separated worshipper heading, idol facing, and home location.
- Preserved the existing public MVP scope: compass and billing follow the core build milestone; Puja Guides and the educational article site are later.
- Aligned camera permission timing, normalized vision output, source attribution, and report examples/counts.
- Defined immutable image/input/source versions, explicit retake and historical-report/media retrieval, and late-worker protection.
- Clarified released-quota reacquisition, reservation expiry, photo-expiry correction, offline deletion limits, and purchase ownership.
- Updated `TASKS.md` with the corresponding pending implementation work.

Still required before affected integrations or launch:

- SDK/plugin selection and identity/hosting/vision vendor selection.
- Actual reviewed launch rules, sources, labels, and evaluation thresholds.
- Final retention policy, free-history depth, premium allowances, pricing, and measured latency/cost.

The original review below is retained as historical rationale. Its descriptions of old defects are superseded where listed above; its proposed scope reductions were not automatically adopted.

---

## Original review verdict (before v1.2 fixes)

The product direction is coherent and suitable for prototyping. The PRD is not yet an implementation-ready specification: it needs a fixed release scope, precise direction inputs, measurable acceptance criteria, and complete data and analysis lifecycles.

The approved app name is **Scan My Mandir**. The main PRD and its filename now use that name. The recommendations below are proposals; they do not silently change the PRD's scope.

## What works

- Clear audience and home-mandir focus.
- Useful core loop: photo, detection, correction, contextual guidance, report.
- Visual observations are separated from sourced traditional guidance.
- Tradition-specific rules, user correction, and source governance are included.
- Safety information remains accessible without payment.

## Changes needed before implementation

### 1. Freeze the first release (sections 7, 8, 30, 33, 47–49)

The PRD calls the MVP narrow but includes subscriptions, compass, profiles, history, guides, and 19 screens. Some screens can be states within one flow. Puja Guides appears on the home screen although the roadmap places it later.

Recommendation: first validate photo/upload → quality check → detect → user correction → context → sourced report → save/delete. Hindi and English belong in that release. Defer compass, subscriptions, and Puja Guides to a subsequent release unless they are launch requirements. Mark every feature Must / Later and make the screen list and Definition of Done agree.

### 2. Define direction precisely (sections 6, 16–18, 26, 52)

Separate `worshipper_facing_direction`, `idol_facing_direction`, and `mandir_location_in_home`. Pointing a phone toward the mandir does not establish all three. Home location requires separate user context; a compass heading alone cannot supply it.

Store which direction was measured, how the phone was held, input method, and accuracy/confirmation status. Ask only for inputs required by an applicable rule. Missing inputs must produce “not assessed.” Include manual entry, skip, sensor-unavailable, and unreliable-reading states. Collect direction before evaluating Vastu rules; the current journey applies rules before collecting direction.

### 3. Make AI output usable and measurable (sections 10–15, 36–38, 48)

Define supported launch labels and distinguish statues, framed images, deity groups, and unknown objects. Specify how a Ram Darbar/group representation counts so duplicate checks do not double-count detections.

A model-returned confidence number is not evidence of calibrated accuracy. Establish thresholds using a reviewed evaluation set before using confidence to gate recommendations. Define acceptance targets for supported-label precision, uncertain-result handling, scan completion, latency, and cost. Include dark photos, occlusion, group idols, illustrations, and non-mandir uploads in evaluation.

Do not infer material, dimensions, unseen damage, or absent objects from an inadequate image. Keep suspected damage subject to user confirmation. “Not visible” must not become “missing.”

### 4. Turn source governance into a launch dependency (sections 13, 22–23, 40)

The sample rules contain placeholders such as `verified_reference`; they are schemas, not production guidance. Assign a reviewer, select the initial supported traditions/topics, and approve the actual launch rules before enabling religious recommendations.

Add rule lifecycle fields: draft/reviewed/published/retired, reviewer, version, required inputs, exceptions, and conflict handling. Unknown tradition should not automatically activate tradition-specific restrictions. If no reviewed rule applies, provide supported observations and say guidance is unavailable.

### 5. Complete the analysis lifecycle (sections 24, 26–27, 34–37)

Define scan states such as uploaded, analyzing, awaiting_confirmation, generating_report, completed, failed, and deleted. Specify background/resume behavior, timeouts, retry limits, and idempotency so repeated taps do not produce duplicate charges or reports.

The API list needs correction/context submission, report regeneration, scan deletion, and account deletion if accounts are supported. Persist confirmed values separately from model predictions. Version reports with their model, rules, and context so old findings remain explainable. Corrections must invalidate dependent findings before regenerating the report.

### 6. Decide account and image retention behavior (sections 26–29)

Choose guest-first or mandatory login and define how saved reports behave across reinstall or devices. Replace “longer than necessary” with explicit original-image, thumbnail, report, log, and backup retention periods. Specify deletion timing and provider-side image handling. Analytics should exclude home photos and free-text religious context by default.

### 7. Validate monetization assumptions (sections 30–32, 41–42)

Monthly subscription demand is unproven for an activity users may perform infrequently. Treat the proposed prices as hypotheses. Compare a paid detailed report/scan pack with a subscription after measuring repeat use and willingness to pay.

Define premium scan limits, quota reset rules, failed-scan refunds, purchase restoration, entitlement expiry, and per-scan cost budgets before implementing billing. Basic source attribution should accompany every traditional claim, including free reports; expanded reference material can be premium.

### 8. Make report examples internally consistent (sections 19–20, 32, 52)

Detected-item counts and finding counts measure different things. One item can have several findings; some findings concern the whole arrangement. Do not present Good + Review + Verify as a partition of detected objects unless the implementation actually enforces that model.

Section 52 lists eight detected items without establishing duplicate representations, then flags multiple representations. Update the example to include evidence for each finding or remove the unsupported flag. Do not flag the mere presence of different deities as a duplicate issue.

Keep status, evidence confidence, and safety priority as separate fields. “Looks good” should mean only that the assessed visible condition appears acceptable, without implying overall religious correctness or a complete safety inspection.

## Suggested acceptance scenarios

- A usable mandir photo produces editable detections and an evidence-linked report.
- An ambiguous idol remains unknown until confirmed; dependent rules wait for confirmation.
- A corrected detection removes obsolete findings and regenerates relevant guidance.
- Unknown tradition or direction never produces a fabricated conclusion.
- A blurry or unrelated image offers a clear recovery action.
- Retrying or reopening a scan does not duplicate usage charges.
- Every traditional finding resolves to an approved rule version and source.
- Deleting a scan removes accessible image/report data according to the stated retention policy.
- Hindi and English communicate the same findings and uncertainty.

## Review boundary

This review assesses the supplied document's internal consistency and product readiness. Religious sources, market demand, pricing, legal requirements, and platform policies have not been independently validated.
