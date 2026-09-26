# Scan My Mandir — Complete Product Requirements Document (PRD)

**Version:** 1.4  
**Document Type:** Product Requirements Document  
**Platform:** Flutter (Dart), Android MVP; iOS planned  
**Product:** Scan My Mandir  
**Status:** Product Definition / MVP Planning

---

## 1. Executive Summary

Scan My Mandir is a Flutter application that allows users to photograph or upload an image of their home mandir/puja space and receive an AI-assisted visual assessment. The MVP launches on Android; the shared Dart codebase is structured for a later iOS release.

The product combines:

1. Computer vision for identifying visible idols, objects, and arrangement patterns.
2. A structured Hindu traditional-practice knowledge base.
3. A rules engine for deterministic checks.
4. Optional Vastu analysis when sufficient directional/contextual information is available.
5. A clear, explainable report with recommendations and uncertainty indicators.

The app should **not claim to scientifically detect “negative energy,” divine presence, spiritual purity, or supernatural phenomena**. Instead, it should distinguish between:
- observable visual findings,
- traditional Hindu guidance,
- traditional Vastu guidance,
- and items that require user confirmation or qualified human advice.

The MVP focuses exclusively on the **home mandir**, not the entire house.

---

# 2. Product Vision

### Vision

Build the most useful AI-assisted digital companion for people who want to understand and organize their home mandir according to traditional Hindu practices.

### Product Promise

> **“Apne mandir ki photo scan karein aur dekhein ki usme kya hai, kya review karna chahiye, aur traditional practices ke according kin cheezon par dhyan diya ja sakta hai.”**

### Long-term Vision

Scan My Mandir can evolve from a photo scanner into a broader Hindu home-practice platform:

- Mandir Scanner
- Puja Assistant
- Vastu Guidance
- Puja Checklist
- Mantra & Vidhi
- Personalized Mandir Profile
- Pandit/Expert Consultation
- Puja Samagri Commerce

---

# 3. Problem Statement

Many users have questions such as:

- Kya mere ghar ke mandir mein murtiyon ki placement theek hai?
- Kya ek hi devta ki multiple murtiyan rakhni chahiye?
- Kya broken/damaged murti ke sambandh mein koi traditional guidance hai?
- Kaun si murtiyan ghar ke mandir ke liye traditionally suitable mani jati hain?
- Mandir mein kaun-kaun si puja samagri honi chahiye?
- Kya mandir mein unnecessary clutter hai?
- Mandir ki direction kya hai aur traditional Vastu ke according kya consider kiya jata hai?
- Kisi object ki placement ke baare mein traditional guidance kya kehti hai?

Today, answers are fragmented across websites, videos, books, social media, and different traditions.

Scan My Mandir aims to turn these questions into a structured, visual, explainable experience.

---

# 4. Target Users

## Primary Users

### A. Homeowners / Families
People maintaining a home mandir and looking for practical guidance.

### B. Devotional Users
Users interested in Hindu puja practices and traditional guidance.

### C. New Home / New Mandir Users
People setting up a mandir for the first time.

### D. Younger Smartphone Users
Users who prefer visual, AI-assisted explanations over reading long articles.

---

# 5. Product Principles

## 5.1 Explain, Don't Pronounce

The app should avoid absolute statements such as:

> “This is definitely wrong.”

Instead:

> “This arrangement is traditionally discouraged in some Hindu practices. Review the relevant tradition/source.”

## 5.2 Separate Observation From Tradition

Every result should clearly identify its type:

- **AI Visual Finding**
- **Traditional Practice**
- **Traditional Vastu Guidance**
- **Safety Recommendation**
- **Needs Verification**

## 5.3 No Supernatural Claims

The product must not present an AI inference as proof of:

- negative energy,
- evil presence,
- divine displeasure,
- supernatural activity,
- spiritual impurity.

If the user asks about “negative energy,” the app should explain that a photo cannot scientifically establish such a condition and then offer a traditional-practice checklist instead.

The app must carry a persistent, user-reachable disclaimer stating that it provides informational and organizational assistance only, that traditional guidance varies by tradition, and that it does not replace a qualified priest or any professional advice. The disclaimer must be reachable from onboarding, from every report, and from Settings. A single first-run acceptance screen that the user cannot revisit is not sufficient.

## 5.4 Respect Tradition Diversity

Hindu practices vary by:
- sampradaya,
- region,
- family tradition,
- deity tradition,
- temple practice.

The knowledge base should store the applicable tradition/source for each rule.

---

# 6. Core User Journey

```text
Open App
   ↓
Scan My Mandir
   ↓
Take Photo / Upload Photo
   ↓
Image Quality Check
   ↓
AI Vision Analysis
   ↓
Detected Objects + Idols
   ↓
Confirm / Correct Items + Ask Context Questions
   ↓
Optional Direction Context / Compass
   ↓
Apply Applicable Traditional / Vastu Rules
   ↓
Generate Report
   ↓
Good / Review / Verify
   ↓
Detailed Recommendations
   ↓
Save Report
```

---

# 7. MVP Feature Scope

The public MVP includes photo scanning, corrections, Hindi/English reports, source details, save/delete, history, mandir profiles, optional-for-user direction/compass, and premium purchase/restore. Build the core scan journey first as an internal milestone. Compass and billing remain in the documented launch scope unless an explicit product decision changes this PRD.

Puja Guides, reminders, the educational content website, and iOS launch are later work. Privacy/support/deletion information needed for Android launch remains required.

Use a managed guest session for the first scan, with optional account upgrade for recoverable cross-device history. Guest users must be told that reinstalling or losing their session can lose access to their history.

## 7.1 Onboarding

On first launch:

- Language selection
- Basic introduction
- Privacy explanation
- Explain camera/gallery use; request camera permission only when the user opens the camera
- No notification prompt until a user enables an implemented notification feature

Languages:

### MVP
- Hindi
- English

### Future
- Marathi
- Gujarati
- Bengali
- Tamil
- Telugu
- Kannada
- Malayalam

---

# 8. Home Screen

Primary CTA:

> **Scan My Mandir**

Secondary actions:

- Upload Photo
- My Reports
- Mandir Profile
- Settings

Home screen should visually communicate that the product is specifically for a **home mandir**.

---

# 9. Photo Capture

## Requirements

User can:

- Take a new photo
- Upload from gallery
- Retake
- Crop
- Continue

## Image Quality Checks

Before analysis:

- Is image too dark?
- Is mandir visible?
- Is image too blurry?
- Is mandir heavily obstructed?
- Is photo resolution sufficient?

If not:

> “Please take a clearer photo with the full mandir visible.”

---

# 10. AI Vision Engine

The vision layer identifies visible entities.

## 10.1 Idol Detection

Potential categories:

- Ganesh
- Shiva / Shivling
- Hanuman
- Krishna
- Radha-Krishna
- Ram
- Sita
- Lakshman
- Ram Darbar
- Lakshmi
- Saraswati
- Durga
- Kali
- Parvati
- Kartikeya
- Vishnu
- Narasimha
- Shani
- Surya
- Navagraha
- Other deity
- Unknown idol

The system must preserve available model confidence as an internal signal and expose uncertainty through verification states. A raw model score is not a calibrated probability. Evaluate supported labels and thresholds against reviewed examples before launch; unsupported labels remain unknown.

Example:

```json
{
  "label": "hanuman",
  "model_confidence": 0.94
}
```

Catalog label IDs are lowercase `snake_case`. User-facing deity names come from Hindi/English localization resources, never from the raw model string.

Low-confidence detections should be shown as:

> “Possible Hanuman idol — please verify.”

---

# 11. Object Detection

Detect common puja objects:

- Diya
- Incense holder
- Incense sticks
- Bell
- Shankh
- Kalash
- Coconut
- Mala
- Flowers
- Puja thali
- Water vessel
- Religious books
- Yantra
- Photo frame
- Oil lamp
- Camphor holder
- Rudraksha
- Decorative objects
- Other objects

---

# 12. Arrangement Analysis

The vision model should analyze observable layout characteristics:

- Number of visible idols
- Multiple similar idols
- Overcrowding
- Obstruction of idols
- Objects blocking the central deity
- Visible clutter
- Damaged-looking object candidates
- Fallen/tilted objects
- Unsafe proximity of flame to combustible material
- Cleanliness indicators where visually reliable

The app must avoid pretending that a photo can establish facts it cannot reliably determine.

---

# 13. Multiple Idol / Duplicate Idol Rules

This is an important feature area.

The knowledge base should support rules concerning:

- multiple representations of the same deity,
- duplicate deity images,
- deity pairs,
- multiple Shivlings,
- multiple Ganesh idols,
- multiple photos/statues.

However, these rules must be stored with:

```text
Rule
Tradition
Source
Confidence
Applicability
Exceptions
```

Example:

```json
{
  "rule_id": "RULE-IDOL-DUPLICATE-001",
  "topic": "multiple_same_deity",
  "status": "review",
  "tradition": "specified_tradition",
  "claim": "Some traditional practices advise against...",
  "exceptions": [],
  "source": "verified_reference"
}
```

The app should never turn a tradition-specific rule into a universal Hindu rule.

Count physical representations separately from deity-group membership. A group image and its members must not be double-counted by duplicate rules. Placeholder sources in examples are not publishable guidance.

---

# 14. Idol Suitability Rules

Knowledge base can contain structured guidance for:

- deity type,
- idol form,
- material,
- condition,
- size/context,
- home worship suitability,
- damaged/broken status,
- special worship requirements.

The UI should say:

> “Traditional guidance”

rather than:

> “Scientifically correct.”

---

# 15. Damaged / Broken Idol Detection

Computer vision can flag a possible issue:

> “This object may be damaged. Please verify manually.”

The MVP flags suspected damage for user confirmation before applying condition-dependent traditional guidance. Model confidence alone does not establish that an idol is broken.

After user confirmation:

> “Traditional guidance regarding damaged sacred images varies. Consult the practice/tradition you follow or a knowledgeable priest for the appropriate handling.”

---

# 16. Vastu Module

Vastu analysis requires information that may not be available from the photo.

Therefore:

### Step 1
Photo analysis.

### Step 2
Ask only the inputs needed for the selected guidance:

- “Puja karte waqt aap kis disha ki taraf muh karte hain?” (`worshipper_facing_direction`)
- “Murti ka saamne wala hissa kis disha ki taraf hai?” (`idol_facing_direction`, separately confirmed)
- “Ghar ke kis hisse mein mandir hai?” (`mandir_location_in_home`, separate user context)

Options:

- North
- South
- East
- West
- Northeast
- Southeast
- Southwest
- Northwest
- I don't know

### Step 3
Offer:

> **Use Compass**

For worshipper heading, the user stands where they worship, holds the phone flat, and points its top edge in the direction they face. Record the measurement kind, input method, heading, quality, and confirmation time. Do not infer idol facing or location within the home from this reading.

Manual input and skip remain available. Missing or unreliable prerequisites produce “not assessed”; the visual report remains usable. Collect direction before evaluating rules that depend on it.

---

# 17. Compass Mode

Requirements:

- Platform sensor access through a Flutter direction adapter
- Magnetometer
- Accelerometer
- Calibration instructions
- Direction display

Example:

```text
Direction You Face While Worshipping

NE 42°

[Confirm Direction]
```

The app should clearly state that phone compass readings can be affected by magnetic interference and are approximate.

---

# 18. Vastu Rules Engine

Rules should be deterministic.

Example structure:

```json
{
  "rule_id": "VASTU-001",
  "condition": {
    "worshipper_facing_direction": "X"
  },
  "recommendation": "..."
}
```

Each rule must contain:

- Rule ID
- Topic
- Condition
- Recommendation
- Tradition/source
- Confidence
- Exceptions
- Explanation

---

# 19. Report Engine

The final report is the core product experience.

## Report Sections

### A. Overview

```text
Mandir Scan Complete

Items detected: 11
Findings requiring review: 3
Findings requiring verification: 2
```

### B. Looks Good

Green/positive section:

- Mandir appears organized
- Main deity is visible
- Puja items are arranged clearly

Only make claims supported by the image.

Object counts and finding counts are independent; one item can support multiple findings, and some findings concern the whole scene.

### C. Review

Examples:

- Multiple similar idols detected.
- Some objects appear crowded.
- One object may be obstructing another idol.

### D. Traditional Guidance

Explain relevant traditional practices.

### E. Vastu

Only show if sufficient direction/context is available.

### F. Safety

Examples:

- Diya appears close to combustible material.
- Keep open flame away from curtains/paper.
- Keep incense in a stable holder.

Safety recommendations should take priority over aesthetic/traditional recommendations.

A stored report revision carries its findings in both Hindi and English. Switching the app language re-renders the same stored revision; it must not require regeneration, create a new revision, or consume a scan.

---

# 20. Report Severity

Use three primary statuses:

## 🟢 Looks Good
No obvious issue detected in the specific visible condition assessed. This is not an overall religious or safety certification.

## 🟡 Review
Potential issue or tradition-specific consideration.

## 🔵 Verify
AI cannot confidently determine the condition and user should verify.

Avoid fear-inducing red warnings for ordinary religious differences.

Store finding type, status, evidence confidence, and safety priority independently. Safety findings take display priority without classifying tradition differences as emergencies.

---

# 21. Explainability

Every recommendation should have:

### What we saw
> “Two similar deity images appear visible.”

### Why it was flagged
> “Some traditional practices discuss limits/preferences around multiple representations.”

### What you can do
> “Review the practice followed by your family/sampradaya.”

### Source
> Reference/source metadata.

---

# 22. Knowledge Base

This is one of the most important assets of the company.

## Data model

Each rule:

```text
Rule ID
Category
Subcategory
Claim
Explanation
Tradition
Region
Source
Source URL / Bibliographic reference
Confidence
Exceptions
Severity
Applicable Context
Last Reviewed
```

## Categories

- Idol placement
- Multiple idols
- Idol form
- Idol material
- Broken/damaged idols
- Puja objects
- Direction
- Mandir cleanliness
- Traditional Vastu
- Safety
- Puja practices

---

# 23. Source Governance

The product must not generate religious rules from an LLM alone.

Recommended pipeline:

```text
Primary / trusted reference
        ↓
Human review
        ↓
Structured rule
        ↓
Rule database
        ↓
Automated testing
        ↓
Production
```

AI may explain a verified rule, but the underlying rule should come from a reviewed knowledge base.

MVP explanations use reviewed Hindi/English templates. Publish only reviewed rule versions with required inputs, exceptions, sources, reviewer, and approval metadata. Unknown tradition must not activate tradition-specific restrictions. If no approved rule applies, return supported observations and explicitly mark traditional guidance unavailable.

---

# 24. AI Architecture

Recommended architecture:

```text
Flutter App (Android MVP)
     ↓
API Gateway
     ↓
Auth / Rate Limit
     ↓
Durable Job Queue / Analysis Worker
     ↓
Vision Model
     ↓
Structured Detections
     ↓
User Confirmation + Context / Optional Direction
     ↓
Rules Engine
     ↓
Vastu Engine
     ↓
Report Generator
     ↓
Flutter App (Android MVP)
```

LLM should not independently decide religious correctness.

The gateway is the backend entry point; rules, Vastu evaluation, and report generation are modules in one backend codebase. Long-running analysis runs in a separate worker process. See `ARCHITECTURE.md` sections 6–10 for lifecycle and interface contracts.

---

# 25. Suggested Tech Stack

## Mobile — Flutter (confirmed)

- Flutter with Dart for shared UI and application logic
- Android first; iOS is a later release, not an MVP launch requirement
- Feature-based structure with presentation, domain, and data boundaries
- Explicit controller/state layer for loading, progress, corrections, and errors
- Flutter camera/gallery adapters with platform-specific permission handling
- Compass adapter for device heading, calibration/accuracy status, manual entry, and unavailable-sensor fallback
- SQLite-backed local cache through a Flutter repository abstraction
- HTTP API client with authentication, timeouts, and safe retries
- Platform-backed secure credential storage through a Flutter adapter
- Hindi/English localization using Flutter localization resources
- Store billing adapter with backend purchase verification

Select and pin Flutter/Dart SDK and plugin versions during scaffolding after checking platform support and maintenance. UI code must not depend directly on plugin APIs. Native platform code is limited to integrations that require it.

Analysis runs on the backend. Persist the scan ID and resume server status after app restart; do not rely on a Dart timer continuing while the app is suspended. Background uploads/retries use supported platform scheduling where available.

Before an iOS release, separately validate permissions, camera/gallery, compass, secure storage, background behavior, and store billing on iOS devices.

## Backend

- TypeScript
- Node.js
- Fastify modular monolith with a separate analysis worker
- PostgreSQL
- PostgreSQL-backed durable jobs and transactional outbox; Redis only if later measurements justify it
- Docker

## AI

Use a vision-capable model for image understanding.

Potential providers can be evaluated based on:

- vision quality,
- latency,
- privacy,
- cost,
- Indian-language performance,
- structured JSON output.

Do not hard-code the product architecture around one model provider.

### Prototype candidate — pending evaluation

Evaluate **GPT-6 Luna through OpenRouter**, model ID `openai/gpt-6-luna`, as the first candidate for visual observations. This records the current discussion; it does not approve the model for production or claim that it identifies every deity correctly. Keep the model configurable on the backend and the API key in server secrets.

Use an initial set of 50–100 representative, appropriately sourced mandir photos with reviewed expected labels. Include crowded arrangements, group images, similar idols, low light, non-mandir photos, and cases that should remain unknown. Record incorrect confident identifications, missed items, false review flags, valid-schema rate, latency, and actual billed cost including reasoning and retries. This is an initial evaluation, not proof of coverage for every proposed label.

Define acceptance thresholds before scoring the set; if coverage or performance is inadequate, compare another vision model on the same examples or narrow supported labels. Religious guidance continues to come from reviewed rules and templates. Compass, payments, storage, and report lifecycle remain application responsibilities.

---

# 26. Data Requirements

The implementation schema is maintained in `ARCHITECTURE.md` section 9. Required entities are:

| Entity | Product requirement |
|---|---|
| Users and identities | Guest/registered ownership, language, secure account linking and deletion |
| Mandirs and context | Profile, tradition, and separately typed direction inputs |
| Scans and media | State, immutable image revision, current input revision, upload status, retention deadline |
| Observations and confirmed items | Preserve AI predictions separately from user corrections |
| Sources, rules, rule versions | Reviewed references, immutable published content, applicability and audit metadata |
| Reports, findings, rule evaluations | Versioned evidence and guidance with exact input/rule/source provenance |
| Jobs and outbox | Durable processing, bounded retry, deduplication and crash recovery |
| Entitlements and quota ledger | Verified purchase access and reserve/consume/release accounting |
| Feedback and deletion requests | Report-specific feedback and tracked data removal |

A scan has an optional mandir profile so guest scanning works without setup. Every owned record must be authorized through its owner. Reports retain structured evidence even when their source photo expires; image overlays require an available retained image.

---

# 27. API Requirements

Use the endpoint contracts in `ARCHITECTURE.md` section 10 as the implementation source of truth. Authentication/session refresh is handled by the selected managed identity provider, not a second application password system.

The API must support:

- Profile/preferences and account deletion.
- Idempotent scan creation, signed upload, upload completion, explicit retake, status and history.
- Observation retrieval, atomic correction/context confirmation, report generation and retry.
- Report reading, authorized media retrieval, source details and feedback.
- Scan deletion, mandir profile management, and explicit associated-data deletion choices.
- Server purchase verification, restoration, and authenticated billing events.

Mutations check ownership and expected revision. Repeated requests must not duplicate provider work, reports, or quota consumption. Deleting a scan prevents workers from publishing further results. Direction is submitted as typed context; no separate compass-only report bypasses the confirmation/rule pipeline.

---
# 28. Privacy

Mandir photos may contain:

- people,
- family members,
- home interiors,
- personal information.

Therefore:

- Encrypt data in transit.
- Encrypt sensitive stored data where practical.
- Avoid retaining raw images longer than necessary.
- Provide delete-scan functionality.
- Do not use customer photos for model training without explicit consent.
- Do not expose photos publicly.
- Strip unnecessary metadata where possible.
- Follow applicable privacy/data-protection requirements. For the India-first launch this includes India's Digital Personal Data Protection Act, 2023: a plain-language consent notice before the first upload, a named grievance contact, a working deletion path, and an explicit decision on how under-18 users are handled. Confirm the current obligations and notified rules through qualified legal review before production collection; this document is not legal advice.

Proposed retention and deletion deadlines are defined in `ARCHITECTURE.md` section 12 and must be finalized before production collection. Text reports may remain after photos expire. Retaining a history thumbnail requires an explicit save-photo choice. Analytics must exclude photos and free-text religious context by default.

---

# 29. Security

Required:

- JWT/session security
- API rate limiting
- Input validation
- Signed upload URLs
- Malware/file validation
- Image size limits
- Authorization checks
- User-level data isolation
- Secure storage
- Logging without sensitive image content
- Abuse prevention
- A rejection path for uploads that are illegal or clearly outside the product's purpose

Uploaded photos are private and are never shown to other users, so the moderation need is narrower than for social products: it protects the vision provider contract, store policy compliance, and anyone who reviews a flagged upload. Define the rejection handling, short retention window, and escalation path before launch. Any human review of a user photo requires a restricted, audited role and must be disclosed to users.

---

# 30. Monetization

## Free

- 3 scans/month
- Basic object detection
- Basic report
- Limited history

## Premium

Potential pricing:

### Monthly
₹49–99/month

### Annual
₹399–699/year

Premium:

- More scans
- Detailed reports
- Vastu module
- Advanced traditional-practice checks
- Saved mandir profile
- Historical reports
- Personalized recommendations
- Detailed source explanations

Pricing should be validated through experiments.

### Latest pricing discussion — proposals, not approved offers

| Candidate | Proposed offer | Decision needed |
|---|---|---|
| Monthly | ₹49/month with a defined premium allowance | Repeat usage, allowance, renewal value, and contribution margin |
| One-time pack | ₹49 for a limited premium scan pack; 5 scans is an initial experiment | Credit quantity, validity, features, restoration and refund behavior |

The monthly/annual ranges above remain earlier hypotheses. Neither the ₹49 subscription nor the one-time pack is selected for launch. A pack means a finite number of paid scan credits; it does not imply lifetime unlimited analysis. Subscription implementation remains in the current public-MVP scope until a documented scope decision replaces or defers it.

Before billing implementation, publish a free/premium feature matrix specifying free-history depth, paid report access, profile access, and which direction features require payment. Distinguish free basic-scan allowance from purchased premium credits. Decide whether upgrading an existing basic report consumes a paid credit and show that action before charging; do not automatically spend paid credits during ordinary correction or retry.

If the pack is selected, specify credit validity, consumption order, account recovery, refunds, and handling of already-used credits before launch. Saved report access and image retention must be explained separately from unused credit validity. Measure contribution per purchase after store fees, applicable taxes, model use/retries, hosting, support, and acquisition costs; token price alone does not establish profitability.

Use the architecture's proposed quota contract: three successful scans per calendar month in one server-configured timezone, with the reset date displayed. The proposed default is Asia/Kolkata for the India-first launch so the displayed reset matches the user's local month; the timezone is fixed in server configuration and is never taken from the device. Reserve allowance before provider work, consume once when the first report succeeds, and release on rejected input or terminal failure. A retry after release must reserve again before new work. Same-photo corrections do not consume another scan. Final premium limits and free-history depth must be specified before billing activation; history visibility is separate from physical data retention.

Basic source attribution and safety information accompany free findings. Premium source explanations add depth without hiding the evidence supporting a displayed claim. Restore purchases and reconcile expiry/refunds on the server. Existing basic reports remain readable after premium expiry; premium operations require a current entitlement.

---

# 31. Future Monetization

Potential future products:

### Puja Samagri
Affiliate/commerce links.

### Pandit Consultation
Lead/booking commission.

### Premium Puja Guides
Paid guided puja experiences.

### Family Plan
Multiple household profiles.

### Expert Review
Human-reviewed report.

---

# 32. Freemium Conversion Strategy

Free scan should provide genuine value.

Example:

```text
Scan Complete

11 items detected

Findings (not a partition of detected items):
✓ 2 positive observations
⚠ 3 review findings
? 2 verification requests

[View Basic Report]

Premium:
Get detailed traditional-practice explanations,
Vastu analysis and saved reports.

[Unlock Full Report]
```

Do not hide safety-critical information behind a paywall.

---

# 33. App Screens

## MVP Screens

1. Splash
2. Onboarding
3. Home
4. Camera
5. Gallery Upload
6. Image Quality Check
7. Analysis Progress
8. Detected Items
9. Context Questions
10. Compass
11. Report Overview
12. Finding Detail
13. Source Detail
14. Mandir Profile
15. Scan History
16. Paywall
17. Settings
18. Privacy
19. Delete Data
20. Terms and Disclaimer

---

# 34. Analysis Progress UX

Avoid fake progress.

Show meaningful stages:

```text
✓ Photo received
✓ Identifying visible objects
✓ Checking arrangement
✓ Applying selected guidance
○ Preparing report
```

---

# 35. AI Failure Handling

If image is unclear:

> “We couldn't confidently identify the mandir. Please upload a clearer image.”

If deity is ambiguous:

> “We detected a possible Shiva-related idol, but we're not confident enough to classify it.”

If tradition is unknown:

> “This guidance may vary by tradition. Choose your tradition or view general references.”

---

# 36. False Positive / False Negative Strategy

Because religious objects can be visually similar:

- Never make high-impact conclusions from low-confidence detection.
- Ask confirmation questions.
- Allow users to correct detected objects.
- Record corrections for evaluation.
- Maintain model confidence thresholds.

---

# 37. User Correction Flow

Example:

```text
AI detected:
Ganesh Ji

[Correct]

Actually:
Lakshmi Ji
```

The correction updates the current analysis.

It should not automatically become training data without the appropriate consent and governance.

---

# 38. AI Prompting Strategy

Vision model should return structured JSON only.

Example:

```json
{
  "schema_version": "1",
  "objects": [],
  "visual_findings": [],
  "image_quality": {
    "usable": true,
    "reasons": []
  }
}
```

The LLM should not invent religious rules.

The canonical normalized contract is in `ARCHITECTURE.md` section 7. Deity representations are categorized objects, not a second overlapping list. Invalid model output is rejected or retried within a bounded budget.

---

# 39. Rule Engine Logic

Pseudo-flow:

```text
detections
   ↓
normalize labels
   ↓
user confirmations
   ↓
load applicable rules
   ↓
filter by tradition/context
   ↓
evaluate conditions
   ↓
generate findings
   ↓
rank by confidence/severity
   ↓
generate explanation
```

---

# 40. Traditional Rule Example

Illustrative schema only:

```json
{
  "rule_id": "idol-rule-001",
  "category": "multiple_idols",
  "condition": {
    "same_deity_count": {
      "operator": ">",
      "value": 1
    }
  },
  "finding": {
    "status": "review"
  },
  "explanation": "Some traditions provide guidance concerning multiple representations of the same deity.",
  "recommendation": "Check the practice followed by your family or sampradaya.",
  "source": "verified_reference"
}
```

This avoids presenting a tradition-specific claim as universal fact.

---

# 41. Analytics

Track:

### Acquisition

- Installs
- Organic installs
- Referral source
- Play Store conversion

### Activation

- First scan started
- First scan completed
- Report viewed
- Second scan

### Engagement

- Weekly active users
- Monthly active users
- Scans/user
- Saved mandirs
- Return rate

### Monetization

- Paywall views
- Trial starts
- Purchases
- Renewal rate
- ARPU

### AI Quality

- Detection confidence
- User corrections
- Report regeneration
- “Not useful” feedback
- Incorrect detection reports

---

# 42. Key Product Metrics

Primary metric:

> **Completed useful mandir scans per active user**

Secondary:

- Scan completion rate
- Report usefulness rating
- Detection correction rate
- D7 retention
- D30 retention
- Premium conversion
- Cost per scan

---

# 43. Feedback System

After report:

> “Was this report useful?”

Options:

- 👍 Very useful
- 🙂 Somewhat useful
- 👎 Not useful

Then:

> “What was wrong?”

- Wrong idol
- Wrong object
- Wrong traditional guidance
- Vastu issue
- Other

This feedback becomes a critical product-quality dataset.

---

# 44. ASO Strategy

Potential Play Store keywords:

- mandir vastu
- home mandir
- puja room vastu
- mandir vastu tips
- ghar ke mandir ki vastu
- mandir me murti
- puja ghar
- hindu mandir
- puja room
- mandir scanner
- vastu checker

Do not keyword-stuff the store listing.

---

# 45. SEO Companion Website

Plan a lightweight educational website after the core app launch. Launch-required privacy, support, and deletion pages must be available before release; the article library is not an app release dependency.

Example pages:

```text
/mandir-vastu
/ghar-ke-mandir-me-kaunsi-murti
/mandir-me-kitni-murti-rakhni-chahiye
/puja-ghar-vastu
/shivling-ghar-me-kaise-rakhe
/ganesh-ji-ki-murti
/mandir-direction
```

Each article should be based on reviewed references and clearly distinguish tradition from fact.

CTA:

> **Scan Your Mandir With Scan My Mandir**

This creates an acquisition funnel:

```text
Google Search
     ↓
Educational Page
     ↓
Scan My Mandir App
     ↓
Free Scan
     ↓
Premium
```

---

# 46. Content Engine

Content categories:

### Deity Guides
- Ganesh
- Shiva
- Hanuman
- Krishna
- Ram
- Lakshmi
- Durga

### Mandir Setup
- Direction
- Placement
- Cleanliness
- Lighting
- Puja objects

### Traditional Questions
- Multiple idols
- Damaged idols
- Idol materials
- Photos vs idols

### Vastu
- Direction
- Room location
- Placement
- Common traditional considerations

---

# 47. MVP Development Plan

## Phase 1 — Foundation

- Flutter/Dart project with Android release configuration and isolated platform adapters
- Authentication
- Camera/gallery
- Image upload
- Backend
- Database
- Basic vision integration
- Automated test harness for Dart and backend code

## Phase 2 — Detection

- Idol detection
- Object detection
- Confidence system
- User correction

## Phase 3 — Rules

- Knowledge base
- Rules engine
- Traditional source metadata
- Findings generation

## Phase 4 — Report

- Report UI
- Detailed findings
- Sources
- Save/share

## Phase 5 — Vastu

- Direction questionnaire
- Compass
- Basic Vastu rules

## Phase 6 — Monetization

- Free limits
- Subscription
- Paywall
- Purchase verification

## Phase 7 — Launch

- Play Store listing
- Privacy policy
- Terms and in-app disclaimer
- Data safety
- Crash monitoring
- Analytics
- Feedback system

---

# 48. MVP Definition of Done

MVP is ready when a user can:

1. Open the Android app.
2. Take/upload a mandir photo.
3. Receive an image-quality assessment.
4. See detected idols and puja objects.
5. Correct incorrect detections.
6. Answer basic context questions.
7. Optionally provide mandir direction.
8. Receive a structured report.
9. See which findings are visual vs traditional vs Vastu.
10. Open the explanation of each finding.
11. See the relevant source/reference metadata.
12. Save the report.
13. Delete the scan/data.
14. Upgrade to premium.

Release additionally requires evaluated supported-label thresholds and latency/cost budgets, approved launch rules, purchase restoration, Hindi/English parity including language switching on an already stored report, a reachable terms and disclaimer surface, deletion during active analysis, and verified retry/ownership behavior. Numeric detection targets, final providers, and premium limits remain explicit launch decisions; the document does not claim measured AI accuracy.

---

# 49. Non-Goals for MVP

Do NOT build initially:

- Whole-house Vastu
- Kundli
- Astrology predictions
- Temple directory
- Pandit marketplace
- Live pandit consultation
- Puja commerce
- Social network
- Full Hindu calendar
- Automatic “negative energy detection”
- Guaranteed spiritual predictions

Ordinary roadmap features can be considered later. Supernatural detection and guaranteed spiritual predictions remain unsupported product claims.

---

# 50. Risks

## Risk 1 — Religious accuracy

Different traditions can disagree.

### Mitigation
Store tradition/source metadata and avoid universal claims.

## Risk 2 — AI hallucination

LLMs can invent religious rules.

### Mitigation
Use a verified rules database as the source of truth.

## Risk 3 — Image recognition errors

Similar idols can be confused.

### Mitigation
Confidence scores + user verification.

## Risk 4 — Vastu misinformation

Vastu is a traditional framework, not a scientifically established measurement system.

### Mitigation
Clearly label it as traditional guidance.

## Risk 5 — Privacy

Users upload photos of their homes.

### Mitigation
Strong privacy controls and limited retention.

## Risk 6 — Fear-based UX

Users may interpret ordinary findings as dangerous.

### Mitigation
Use calm language and avoid supernatural/health claims.

---

# 51. Future Roadmap

## V1.1
- More deity classes
- Better object detection
- Hindi voice guidance
- More traditional references

## V1.2
- Mandir setup planner
- AI-generated organization suggestions
- Personalized puja checklist

## V1.5
- Puja guide
- Mantra audio
- Daily reminders

## V2
- Full Hindu Home Assistant
- Whole-room analysis
- Temple discovery
- Expert review

## V3
- Mandir/Puja SaaS ecosystem
- Pandit platform
- Puja commerce
- API

---

# 52. Example End-to-End Experience

### User

Uploads a photo.

### AI detects

```text
Ganesh Ji
Possible Hanuman Ji — unconfirmed
Shivling
Diya
Bell
Shankh
Flowers
Religious books
```

### App asks

> “Is this your regular home puja space?”

User: Yes.

> “Which direction do you face while worshipping?”

User: Northeast.

For this illustrative photo, the deity area is unobstructed, puja objects are crowded together, and the diya appears close to the visible books. The user leaves the possible Hanuman identification unconfirmed. No duplicate representation is established and the home's mandir location is unknown.

### Report

```text
MANDIR SCAN

✓ 8 visible item entries; 1 identity needs verification

GOOD
- Deity area is unobstructed in this photo

REVIEW
- Some items appear crowded

VERIFY
- Possible Hanuman Ji identification needs confirmation

VASTU
- Worshipper facing direction supplied: Northeast
- Home-location rules not assessed: location not supplied
- Other guidance appears only if an approved applicable rule exists

SAFETY
- Diya appears close to the visible books; keep flame away from paper
```

Then each finding has:

> **Why?**  
> **Traditional context**  
> **What you can do**  
> **Source**

---

# 53. Brand Positioning

### Brand

**Scan My Mandir**

### Tagline

> **“Apne Mandir ko samjhein. Parampara ke saath.”**

Alternative:

> **“Scan. Understand. Organize.”**

Hindi:

> **“Mandir scan karein, parampara ke anusaar samjhein.”**

---

# 54. Final Product Strategy

The first version should be deliberately narrow:

> **Photo → Detect → Verify → Context / Optional Direction → Applicable Rules → Actionable Report**

The competitive advantage is not merely the AI model.

The defensible layer is:

1. Curated Hindu knowledge base
2. Tradition-aware rules engine
3. High-quality visual detection
4. Explainable recommendations
5. User correction data
6. Mandir-specific UX
7. Privacy-first image handling

The product should position itself as an **AI-assisted informational and organizational tool for home mandirs**, not as a supernatural detector or an authority that declares a user's worship practice spiritually “right” or “wrong.”
