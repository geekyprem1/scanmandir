# Scan My Mandir — Market Demand Research

**Date:** 25 September 2026
**Status:** Research findings — evidence record, not decisions
**Method:** Ten parallel research agents, each covering a distinct angle (search demand, Play Store traction, willingness to pay, community signals, Feng Shui analog, Vastu services market, faith-tech category, failure cases, user reviews, video/social demand)
**Related:** `Scan_My_Mandir_PRD.md`, `PRD_REVIEW.md`, `docs/decisions.md`

This document records external demand evidence for the product concept. It does not change PRD scope, approve any feature, or validate any implementation. Vendor marketing claims are labelled as unverified. Several figures are third-party estimates.

---

## 1. Summary verdict

**Topic/problem demand is real and strong. Demand for the exact product form (paid, self-serve AI photo scan) is unproven.**

| # | Angle | Verdict | Confidence |
|---|---|---|---|
| 1 | Search demand (India) | Moderate | Medium |
| 2 | Play Store traction for AI scanning | Weak | Medium |
| 3 | Willingness to pay (human guidance) | Moderate | Medium |
| 4 | Community demand signals | Moderate | Medium |
| 5 | Feng Shui photo-scan analog | Weak | Medium |
| 6 | Vastu services market | Strong | Medium |
| 7 | Faith-tech category health | Moderate | Medium |
| 8 | Failure/risk scan | High risk | Medium |
| 9 | User review mining | Moderate | Low |
| 10 | YouTube / Hindi media demand | Strong | High |

Five angles support real demand for the problem; four show the specific paid-AI-scan mechanic is unvalidated; one shows category-level risk.

---

## 2. Evidence FOR demand

### 2.1 Video and content demand (strongest signal)

- "पूजा घर में ये 3 मूर्तियाँ कभी नहीं रखनी चाहिए" — **8,045,388 views, 5,262 comments** (~3 years old).
- "पूजा घर में ये 2 मूर्तिया एकसाथ भूलसे भी न रखें" — **2,511,226 views**.
- Direction video "In Which Direction Should the Home Temple Be Placed?" — 1,125,599 views; "घर के मंदिर में किस देवी-देवताओं की मूर्ति रखें" — 1,096,256 views.
- 2025–2026 uploads still perform: 214,199 (~Oct 2025), 127,859 (Jan 2026), 61,550, 4,831 (Jul 2026).
- Channels: Vastu Tips 5.86M subs, Dr Anand Bhardwaj 1.24M, Anand Pimpalkar 1.2M, vastumiracles 826K, Dr Puneet Chawla 825K.
- Comment sections contain the exact product question, e.g. "Mere Ghar me mandir West me kya sahi hai", "Puja ghar me kon si tayels lagani chahiye".
- 10+ Hindi outlets (Amar Ujala, Navbharat Times, India TV, NDTV India, News18 Hindi, Jagran) publish mandir-vastu content through 2026 on a recurring beat.
- No dedicated mandir-only mega-channel exists (closest: 55 subscribers) — the topic rides general vastu channels.

### 2.2 Search demand

- Google Trends (India, index 0–100, scaled within each comparison): "mandir vastu" ~6.5 (2019) → ~20 (Jan–Sep 2026); "mandir direction" ~10 → ~27; "mandir ki vastu" **≈+58% YoY**; "ghar ka mandir" 2025 average ≈39 → Jan–Aug 2026 ≈72 (**≈+85% YoY**).
- Seasonality confirmed: Diwali lift ("puja room" Sep 2025 = 60 → Oct 2025 = 84) and Chaitra-Navratri lift (Feb 2026 = 60 → Mar 2026 = 77).
- Justdial reported vastu-consultant searches **+25% India-wide, +61% Delhi** (FY2025→FY2026); spiritual-healing searches +64%.
- Caveat: absolute monthly volumes are not publicly verifiable with free tools; demand is fragmented across many small queries, not one head term. "puja room vastu" specifically is negligible.

### 2.3 Community demand

- r/hinduism (~226k members): photo posts asking for mandir feedback are its highest-engagement content type — "Any tips on my mandir?" 361 upvotes / 97 comments; "My mandir and pooja set" 388/18; shivling size question 262/47; new-murti pran pratishtha question (Jan 2026) 106/12.
- All four product risk areas appear as real threads: duplicate idols ("Too many Ganeshas", 41/12), damaged murti (14/22), direction/Vastu, shivling suitability.
- Facebook Vastu groups and NoBroker forum threads exist on the same questions.
- Caveat: askers skew diaspora/English; answers today come free from crowds, pandits, or paid consultants.

### 2.4 Stated preference and services market

- 99Acres (Feb 2025): **62% of home buyers prefer Vastu-compliant homes; 44% would pay a premium**.
- ~6,971 Vastu consultants in India (Smartscrapers, Apr 2026; +3.85% vs 2023), 3,253 with websites, 763 with YouTube channels; Poidata lists 11,149. Typical fees ₹5,000–50,000.
- Redseer (May 2024): online astrology ~$102–106M in 2024 (~1.5% of total astrology spend), forecast to reach ~9% by 2030 (~10x growth).
- India spiritual-wellness app market projected USD 263.4M by 2033, 15.83% CAGR (Grand View Research).

### 2.5 Proven willingness to pay — for human guidance

- Astrotalk FY25: operating revenue **₹1,176 crore (+81–85% YoY)**, ~₹250 crore profit, **1.5M monthly transacting users**, ~₹230 average transaction; unicorn via Aug 2026 ESOP buyback, IPO targeted.
- InstaAstro: revenue ₹52 cr FY25 → ₹111.26 cr FY26; ₹200 cr annualised claim; 12M users; **$12M Series A (Aug 2026)**. Sells Vastu consultations.
- AppsForBharat / Sri Mandir: 40M+ downloads, 3.5M MAU, FY25 revenue ₹69.6 cr (3.8x), ₹175 cr (~$20M) Series C (Jun 2025); 52 lakh pujas across 70 temples.
- Astrotalk lists Vastu as an explicitly paid chat category ($0.99–4.49/min).
- India in-app consumer spend: >$1B (2025), ~$1.25B projected (2026), record $345M in Q2 2026 (+35% YoY).

**Reading:** Indians demonstrably pay for human-delivered guidance at scale. They have not demonstrably paid for self-serve AI-generated guidance in this category (see 3.4).

---

## 3. Evidence AGAINST / unproven

### 3.1 Play Store traction for AI photo scanning is near zero

- Every Vastu app advertising camera/photo AI scanning sits at **≤5K installs**: Vastu Ai 1K+, AI Vastu: Smart Compass 500+, AI Vastu & Astro 500+, Vastu AI: Home & Office 5K+, Suvastu 500+, Vastu Sense AI 10+, Hi Vastu 10+, VastuVision AR 10+, WoW Vastu AI 50+, Vastu AI Scanner 10+, Vaastu AI Floor Plan 1K+.
- Scale exists only for non-AI utilities/consultation: Saral Vaastu **1M+**, Vastu Compass by AppliedVastu **500K+** (4.5★, 37.5K ratings), Kintsapp 100K+.
- The AI niche is crowded and commoditised: ~15 near-identical "AI Vastu" listings, mostly solo developers, several merely wrapping Gemini with a bring-your-own API key.
- **No mandir / murti / deity-scanning app exists** in Play search — genuine white space, but also zero demand validation for the mechanic.

### 3.2 The international analog (Feng Shui) does not prove the business

- Feng Shui Hero: Room Scanner — **4.4/5 from 8 ratings**; IAP $12.99/week, $44.99/year.
- Shuify claims "1,000,000+ downloads" on its website; Google Play shows **500+ installs**, iOS shows 2 ratings.
- LuminQi domain is ~5 months old; Feng Shui Analyst is pre-launch with a **247-entry waitlist**; ChiFlow is a free beta.
- The only verified niche revenue found: **LumenFeng — MRR $45/month, $0 customers** (Stripe-verified).
- Paid demand concentrates in adjacent astrology subscriptions (Co-Star 4.3M MAU, Nebula $50M ARR), not photo scanning.
- No funding round, revenue disclosure, or press exists for any photo-based Feng Shui/vastu AI product.

### 3.3 Failure cases

- **DevDham (ex-DevDarshan) shut down ~May 2026** — after ₹6 cr seed (Jan 2024), 500 temples, 2,000 pandits; acquisition talks failed; cited causes: monetization, CAC, seasonal cash flow.
- **My Tirth India shut Aug 2024** (funding crunch).
- **One Mandir** ("India's First AI-powered Mandir", ₹1/month, aarti + AI havan pandit): **10+ downloads** (updated 6 Sep 2026).
- **TaraTok** (AI Vedic + palm photo-scan, PR launch 15 Nov 2025): 100+ downloads, last update 16 Dec 2025 — effectively dead within a month.
- AI Vastu Compass removed from the App Store; Vastu Shastra (Bhavitech) removed from Play (Mar 2024).
- Faith-tech equity funding: $51.7M (2024) → $36.6M (2025) → **$166K YTD 2026 (−98.67%)**. Category money is consolidating into the few proven platforms.

### 3.4 No purchase evidence for AI-generated Vastu reports

- AI report prices exist (₹99–₹499; VastuAgent free core + paid upgrades; vaastu-ai.com ₹299–499) but **no vendor discloses revenue, purchase counts, or review data mentioning payment**. VastuAgent's "10,000+ users"/"12,000+ properties" and vaastu-ai's "17,400 floor plans since Sept 2025" are self-reported with no third-party corroboration.
- India faith-app ARPU is low: Sri Mandir **₹600–800/year in India** vs ~₹7,000 for NRI users.
- Subscription conversion benchmarks for South/SE Asia run at 40–65 (index vs US = 100).

### 3.5 User-review themes (accuracy and generic advice are the category's wounds)

From 18 reviews across adjacent apps (the AI competitors are too new to have reviews):

- Accuracy is the #1 complaint: "no way to confirm the Accurate north… Many times the App shows totally incorrect EAST-WEST-NORTH-SOUTH"; "not accurate at all."
- Generic advice is actively resented: "It gives just book information… It is meaningless."
- Users ask for visuals: "Most importantly missing pictures. A picture explained a thousand words."
- Praise goes to self-service without a consultant and to specific remedies.
- Notably, **no review explicitly demanded photo-scan input** — photo scanning is supply-side enthusiasm, not yet a demonstrated user pull.

### 3.6 Regulatory and trust risk

- IT Amendment Rules 2026 (in force 20 Feb 2026): mandatory AI labelling, 3-hour takedown, traceability for synthetically generated information.
- Jan 2026: Puri Jagannath temple removed **97 AI-generated deity images** and filed a police complaint — active sensitivity around AI and religious imagery.
- Fake-priest and bogus temple-portal scams (~21,000 people duped) have already damaged trust in digital religious services.

---

## 4. Competitor map (as of 25 September 2026)

| Competitor | Type | Scale signal | Relation to this product |
|---|---|---|---|
| Saral Vaastu | Human consultants app | 1M+ installs | Proves Vastu demand, human-delivered |
| Vastu Compass (AppliedVastu) | Compass utility | 500K+ installs, 37.5K ratings | Proves utility habit, no AI |
| Astrotalk | Astrology + Vastu chat | ₹1,176 cr FY25, 1.5M monthly payers | Proves human-guidance monetization |
| Sri Mandir (AppsForBharat) | Pujas, devotion | 3.5M MAU, ₹175 cr raise | Adjacent faith-tech, low India ARPU |
| VastuAgent.ai | AI Vastu reports (floor plan + photos) | "10,000+ users" claim, unverified | Closest scope overlap; whole-home, floor-plan-first |
| Vaastu-AI.com | AI Vastu reports | "17,400 plans since Sep 2025", unverified | Direct pricing benchmark (₹499) |
| Asteriya.com | Room-photo Vastu consultation | Free, privacy-first, no scale data | Same photo mechanic, whole-room |
| Hi Vastu | Room-photo Vastu app | 10+ installs, updated Sep 2026 | Closest mobile photo mechanic, tiny |
| Feng Shui Hero | Photo-scan feng shui (iOS) | 8 ratings | International analog, unproven |
| MythicVision (research) | Deity identification ML | Academic paper | Proves deity ID is technically done, not productised |
| One Mandir | Devotional AI app | 10+ installs | Cautionary example |

---

## 5. Implications for the project

1. **The problem is validated; the mechanic is not.** People ask "is my mandir okay?" constantly (8M-view videos, 361-upvote Reddit photo posts, a permanent Hindi news beat). Nobody has proven they will pay for a photo-based AI answer. The PRD's core loop assumes that leap.
2. **Willingness to pay is proven for humans, not for software.** Astrotalk's ₹230 average ticket and ₹5,000–50,000 consultant fees contrast with zero verified purchases of ₹99–499 AI reports. A ₹49 pack or subscription has no comparable evidence base in this exact segment.
3. **The review evidence supports the PRD's differentiators.** Accuracy distrust and generic-advice resentment are the two loudest complaints; the PRD's reviewed-rules, sourced, explainable report directly targets both. This is the strongest argument in the documents' favour.
4. **Category timing is mixed.** Faith-tech is large and still funded at the top (InstaAstro, Utsav raises in Aug 2026), but early-stage funding has collapsed (−98.67% YTD 2026) and multiple funded players died. A new entrant should assume capital scarcity.
5. **Compliance is now a first-class constraint.** AI labelling duties and the Puri deity-imagery incident mean the app must be careful about any AI-generated religious imagery or claims — the PRD's "no supernatural claims" principle is necessary but not sufficient for IT Rules 2026.
6. **Free competition is the real baseline.** Reddit, YouTube, pandits and family members answer these questions for free; the paid product must be clearly better than free (personalised, sourced, fast), not merely convenient.

---

## 6. Recommended validation before implementation

None of this requires building the app:

1. **Landing page + small ad spend.** "Apne mandir ki photo bhejein, reviewed report payein" — measure CTR, signup rate, and photo-submission rate against ₹5–10k spend.
2. **Concierge MVP (Wizard of Oz).** Collect real mandir photos via WhatsApp/form; produce reports manually using the PRD's report structure; measure submission rate, report usefulness feedback, and whether users return for a second scan.
3. **Price test.** Present a ₹49 pack of 3 scans and a subscription option to at least 20–30 target users; ask what they would actually pay and for what (scans vs report depth).
4. **Only after signals exist**, revisit Phase 0 tasks and P0-05 evaluation with real photo data.

---

## 7. Limitations of this research

- Absolute search volumes could not be verified with free tools; Google Trends indices are relative and scaled per comparison.
- Play Store install brackets are coarse; several competitor apps are under six months old.
- Quora view counts and Facebook group sizes were not retrievable (JS/login gated).
- Google Play no longer renders review sections for most listings; review evidence came from adjacent apps with volume.
- All AI-vastu vendor scale claims are self-reported.
- No revenue, retention, or conversion data exists publicly for any photo-scan vastu/feng-shui product.
- This research assesses demand signals only; it does not validate religious-source quality, pricing, or unit economics.

---

## 8. Sources

**Demand and search**
- [Google Trends — mandir vastu (India)](https://trends.google.com/trends/explore?geo=IN&q=mandir%20vastu)
- [Newsmeter — Justdial spiritual searches +64%, vastu +25%](https://newsmeter.in/data-stories/more-indians-turning-to-tarot-and-vastu-as-spiritual-searches-surge-64-justdial-searches-766754)
- [Grand View Research — India spiritual wellness app market](https://www.grandviewresearch.com/horizon/outlook/spiritual-wellness-app-market/india)
- [99Acres via StartupFeed — 62% prefer Vastu-compliant homes](https://startupfeed.in/vastu-ai-proptech-stress-proof-micro-workspaces-india-2026/)

**Willingness to pay and market size**
- [Economic Times — Astrotalk FY25 revenue ₹1,176 cr](https://economictimes.indiatimes.com/tech/startups/online-astrology-service-astrotalks-fy25-revenue-surges-81-to-rs-1176-crore/articleshow/127691241.cms)
- [TechCrunch — Sri Mandir / AppsForBharat](https://techcrunch.com/2025/06/30/sri-mandir-keeps-investors-hooked-as-digital-devotion-grows/)
- [Inc42 — AppsForBharat FY25](https://inc42.com/buzz/appsforbharat-fy25-net-loss-widens-16-to-inr-45-cr/)
- [YourStory — InstaAstro $12M Series A](https://yourstory.com/2026/08/astrology-platform-instaastro-raises-12-million-in-series-a)
- [TechCrunch — India app consumer spend](https://techcrunch.com/2026/07/31/india-is-starting-to-pay-for-apps-not-just-download-them/)
- [Consultancy.in — Redseer online astrology market](https://www.consultancy.in/news/4175/look-to-the-stars-indias-online-astrology-market-booms)
- [Rentech Digital — 6,971 Vastu consultants](https://rentechdigital.com/smartscraper/business-report-details/list-of-vastu-consultants-in-india)

**Competitors and traction**
- [VastuAgent.ai](https://vastuagent.ai/)
- [Vaastu-AI.com](https://www.vaastu-ai.com/)
- [Asteriya — Vastu](https://asteriya.com/vastu-shastra)
- [Hi Vastu — Google Play](https://play.google.com/store/apps/details?id=com.hivastu.app)
- [Vastu Compass by AppliedVastu — Google Play](https://play.google.com/store/apps/details?id=com.appliedvastu.compass)
- [Saral Vaastu — Google Play](https://play.google.com/store/apps/details?id=com.cgp.saral)
- [Feng Shui Hero: Room Scanner — App Store](https://apps.apple.com/us/app/feng-shui-hero-room-scanner/id6740708156)
- [Shuify — Google Play](https://play.google.com/store/apps/details?id=com.shuify.app)
- [LumenFeng — verified MRR](https://www.provenmrr.com/startup/lumenfeng)
- [VastuIQ reviews](https://vastuiq.com/vastu-reviews/)
- [AppBrain — Vastu Shastra user reviews](https://www.appbrain.com/app/vastu-shastra/com.tuneonn.vastu)

**Failures and risk**
- [Entrackr — DevDham shutdown](https://entrackr.com/exclusive/exclusive-devotional-startup-devdham-shuts-down-operations-11825233)
- [Outlook Business — startups shut in 2024](https://www.outlookbusiness.com/ampstories/news/start-up-struggles-key-indian-ventures-that-shut-down-in-2024)
- [Google Play — One Mandir](https://play.google.com/store/apps/details?id=com.onemandir.app)
- [Google Play — TaraTok](https://play.google.com/store/apps/details?id=com.taratok)
- [Tracxn — Religion tech startups in India](https://tracxn.com/d/explore/religion-tech-startups-in-india/__8soITlu1A67zPQXBzgY7N45nmPH5CQwpexcS0aMizTs/companies)
- [Mondaq — IT Rules 2026 AI labelling](https://www.mondaq.com/india/new-technology/1760554/it-rules-2026-deepfake-regulation-three-hour-takedowns-and-ai-labelling-obligations)
- [New Indian Express — Puri temple AI deity images complaint](https://www.newindianexpress.com/states/odisha/2026/Jan/20/ai-generated-videos-of-lord-jagannath-go-viral-puri-temple-files-police-complaint)
- [CBC — Gita chatbot misinformation](https://www.cbc.ca/news/world/india-religious-chatbots-1.6896628)

**Community and video**
- [r/hinduism — "Any tips on my mandir?"](https://reddit.com/r/hinduism/comments/10ty17k/)
- [r/hinduism — Shivling size question (Jul 2025)](https://reddit.com/r/hinduism/comments/1m9r8a4/)
- [YouTube — पूजा घर में ये 3 मूर्तियाँ कभी नहीं रखनी चाहिए (8M views)](https://youtube.com/watch?v=JelbrDEufSg)
- [YouTube — पूजा घर में ये 2 मूर्तिया एकसाथ भूलसे भी न रखें](https://youtube.com/watch?v=S5p6-jEAozU)
