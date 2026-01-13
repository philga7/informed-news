# OSINT NEWS DASHBOARD - COMPLETE PACKAGE
## Index & Quick Navigation

**Date**: January 12, 2026  
**Status**: ✅ Ready for Cursor IDE Development  
**All files**: Downloadable, editable, production-ready

---

## 📦 WHAT YOU HAVE

Four complete, downloadable files:

### 1️⃣ `osint-dashboard-requirements.md`
**270 lines | Editorial Architecture**
- Full editorial framework (audience, domain, velocity, criteria)
- Topic stratification (Tier 1/2/3 logic)
- Corroboration & clustering rules
- Live blog / real-time event detection
- Dashboard elevation criteria with weights
- Integration points with your existing system

**Use case**: Understand the journalistic logic behind every decision

---

### 2️⃣ `osint-implementation-specs.md`
**150 lines | Technical Specifications**
- Confirmed specifications (all your answers captured)
- Elevation algorithm (pseudocode)
- Live event detection algorithm (pseudocode)
- Data models (Story, LiveEvent, Topic, UpdateEntry)
- Implementation phases (Phase 1-5)

**Use case**: Technical reference; share with development team

---

### 3️⃣ `cursor-prompt-dashboard.md` ⭐ **START HERE**
**750+ lines | Complete Development Prompt**
- Context & mission (copy this into Cursor IDE)
- Full data models (ready to implement)
- Four core algorithms with working pseudocode
- GenAI integration points (3 prompt templates)
- API endpoints (mock specifications)
- Configuration parameters (environment variables)
- Implementation checklist (Phase 1-6)
- Testing strategy
- Deployment guidance

**Use case**: **Copy entire file into Cursor IDE and begin Phase 1**

---

### 4️⃣ `implementation-summary.md` (This File's Companion)
**200+ lines | Quick Start & Reference**
- What was decided (summarized)
- File descriptions and use cases
- How to use these files (timeline)
- Key architectural insights
- Quick reference values (copy-paste)
- Source weight hierarchy
- What comes next (Phase 1 deliverables)

**Use case**: Navigation, quick reference, project planning

---

## 🚀 GET STARTED IN 3 STEPS

### Step 1: Understand the Architecture (30 min)
1. Read `osint-dashboard-requirements.md` - understand editorial logic
2. Skim `osint-implementation-specs.md` - understand data model
3. Bookmark `cursor-prompt-dashboard.md` for development

### Step 2: Prepare Your Development Environment (15 min)
1. Open Cursor IDE
2. Have your existing app's database schema available
3. Have your formal topics list ready

### Step 3: Begin Phase 1 Implementation (today/tomorrow)
1. Copy entire `cursor-prompt-dashboard.md` into Cursor IDE
2. Implement Story, LiveEvent, Topic data models
3. Build corroboration clustering algorithm
4. Test with real articles from your feeds

---

## 📋 PHASE 1: MVP (First Week)

**What to build**:
- [ ] Story database table (with all required fields)
- [ ] LiveEvent database table
- [ ] Topic database table
- [ ] Corroboration clustering algorithm
- [ ] Elevation scoring function
- [ ] Dashboard API endpoint (GET /dashboard)
- [ ] Source weight configuration

**Success looks like**:
- AP + Reuters story appears in Tier 1 Elevated ✓
- Tech news (2+ sources) appears in Tier 2 Developing ✓
- Corporate story (3+ sources) appears in Tier 3 Monitoring ✓
- Nothingburger auto-demotes after 6 hours ✓
- Dashboard returns real stories grouped by tier ✓

**Expected time**: 3-5 days with focus

---

## 📊 CORROBORATION SCORING (Quick Reference)

**How stories get elevated**:

```
ELEVATION_SCORE = (
  corroboration_level * 0.40 +     # Your top priority
  topic_tier * 0.30 +              # Tier 1 > Tier 3
  update_velocity * 0.15 +         # Rapid updates = developing
  source_diversity * 0.10 +        # Multiple outlets
  recency_decay * 0.05             # Freshness matters
)

WHERE:
  - Tier 1 (Geopolitical) needs 2 credible sources
  - Tier 2 (Technology) needs 2 credible sources
  - Tier 3 (Corporate) needs 3 credible sources
  - Story NOT in negative topics list
```

**Dashboard appearance**:
- Score ≥ 0.75 → **Tier 1 Elevated** (prominent)
- Score 0.50-0.75 → **Tier 2 Developing** (grouped)
- Score 0.30-0.50 → **Tier 3 Monitoring** (low visibility)
- Score < 0.30 → **Archive** (searchable only)

---

## 🔑 SOURCE WEIGHTS (For Your Code)

Use these credibility multipliers:

| Source Type | Weight | Examples |
|-------------|--------|----------|
| Wire services | 1.0 | AP, Reuters, BBC, AFP |
| Major newsrooms | 0.95 | NYT, FT, Guardian, WSJ |
| Regional authorities | 0.85 | Country-specific quality outlets |
| Specialized credible | 0.80 | Bloomberg, Ars Technica |
| General tech/business | 0.60 | TechCrunch, VentureBeat |
| Niche/specialist | 0.40-0.70 | Context-dependent |
| Unknown/emerging | 0.30 | Flagged for review |

---

## ⚙️ ENVIRONMENT VARIABLES (Copy-Paste)

```bash
# Corroboration thresholds
CORROBORATION_TIER1_SOURCES_NEEDED=2
CORROBORATION_TIER2_SOURCES_NEEDED=2
CORROBORATION_TIER3_SOURCES_NEEDED=3

# Live event detection
LIVE_EVENT_ARTICLE_THRESHOLD=5
LIVE_EVENT_TIME_WINDOW_MINUTES=60
LIVE_EVENT_UPDATE_FREQUENCY_COOLDOWN_HOURS=4
LIVE_EVENT_CLOSURE_HOURS=24

# Elevation scoring cutoffs
ELEVATION_SCORE_TIER1_CUTOFF=0.75
ELEVATION_SCORE_TIER2_CUTOFF=0.50
ELEVATION_SCORE_TIER3_CUTOFF=0.30

# False positive recovery
STALL_DETECTION_HOURS=6
STALL_DETECTION_NEW_ARTICLES_THRESHOLD=0

# Topic auto-promotion
ADHOC_TOPIC_PROMOTION_THRESHOLD=3
ADHOC_TOPIC_PROMOTION_WINDOW_HOURS=24

# Geographic focus
PRIMARY_GEOGRAPHY="US,GA"
SECONDARY_GEOGRAPHY="Global"
GEOGRAPHY_BOOST_FACTOR=1.2
```

---

## 🤖 GenAI INTEGRATION (Phase 2)

Two use cases where AI assists (with human review gates):

### 1. Headline Similarity Detection
**Detects**: Exact events despite language variation  
**Example**: "Taiwan military exercises begin" = "Chinese jets conduct drills near Taiwan"  
**Prompt provided**: Yes (in cursor-prompt-dashboard.md)

### 2. Topic Extraction
**Detects**: Emergent topics not in your formal taxonomy  
**Example**: Identifies "OpenAI GPT-5 release" as new tech topic  
**Prompt provided**: Yes (in cursor-prompt-dashboard.md)

---

## ❌ FALSE POSITIVE RECOVERY (3-Path System)

**Path A: Auto-Demotion**
- Story with 0 new articles for 6 hours → auto-flagged as stalled
- → Moved to Archive automatically

**Path B: Editorial Notes**
- User adds CORRECTION_NOTE: "This was mis-tagged as Tier1 but is actually Tier3"
- → System learns; future similar stories handled better
- Template included in cursor-prompt-dashboard.md

**Path C: Manual Rating**
- User gives thumbs up/down on elevation decisions
- → Feedback logged for efficacy tracking
- → Negative ratings lower source credibility weight

---

## 📈 SUCCESS METRICS (Phase 1)

After Phase 1 (MVP), you should have:
- ✅ Working corroboration clustering
- ✅ Accurate elevation scoring (matches editorial judgment)
- ✅ Dashboard with 3 story tiers
- ✅ Real stories from your feeds elevated correctly
- ✅ No false elevations (nothingburgers auto-demote)
- ✅ API ready for UI layer

**Confidence level**: Moderate (ready for UI iteration)

---

## 📱 WHAT THE DASHBOARD LOOKS LIKE

**Three visible sections**:

```
┌─────────────────────────────────────┐
│  TIER 1 ELEVATED (Geopolitical)     │
│  - Taiwan military exercises        │
│  - Russia Ukraine offensive          │
│  - India-Pakistan tensions           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  TIER 2 DEVELOPING (Technology)     │
│  - OpenAI releases new model        │
│  - Meta announces AI initiative     │
│  - Nvidia earnings report            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  TIER 3 MONITORING (Corporate)      │
│  - Tech CEO resigns                  │
│  - Merger announcement               │
│  - Product recall                    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  🔴 LIVE STREAM (Real-Time)         │
│  - Active coverage: Taiwan exercises│
│    Update 1: Military drill begins   │
│    Update 2: US monitors closely     │
│    Update 3: Status: Still developing│
└─────────────────────────────────────┘
```

---

## 🎯 TIMELINE TO LAUNCH

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | 3-5 days | MVP: Corroboration clustering + elevation |
| Phase 2 | 2-3 days | GenAI integration (similarity + extraction) |
| Phase 3 | 2-3 days | Live event detection + real-time refresh |
| Phase 4 | 2-3 days | False positive recovery + editorial notes |
| Phase 5 | 3-5 days | Dashboard UI + public interface |
| Phase 6 | 2-3 days | Ad-hoc topic management + polish |
| **Total** | **2-3 weeks** | **Launched** |

---

## 📞 QUESTIONS?

All answered questions are in:
- `osint-dashboard-requirements.md` - Editorial "why"
- `osint-implementation-specs.md` - Technical "what"
- `cursor-prompt-dashboard.md` - Implementation "how"

New questions during development? You know where to find me in this space.

---

## ✅ CHECKLIST: BEFORE YOU START PHASE 1

- [ ] Downloaded all four files
- [ ] Read `osint-dashboard-requirements.md`
- [ ] Have your 6 formal topics list ready
- [ ] Know your existing database schema
- [ ] Have Cursor IDE open
- [ ] Have `cursor-prompt-dashboard.md` bookmarked
- [ ] Ready to copy prompt into Cursor

**When all checked**: Start Phase 1 implementation

---

## 🚀 FINAL WORDS

This is production-ready architecture. Every algorithm is specified, every data model is defined, every API endpoint is mocked. You have everything needed to build a professional OSINT dashboard.

**Your competitive advantage**: 
- You understand editorial logic (corroboration > volume)
- You're building for your actual needs (not generic news aggregator)
- You have false positive recovery built-in (keeps system trustworthy)
- You can extend it over time (phases 2-6)

**Next action**: Copy `cursor-prompt-dashboard.md` into Cursor IDE and start Phase 1.

You've got this. 🎯

---

**Generated by**: Senior News Producer (OSINT Intelligence Consulting)  
**Date**: January 12, 2026  
**Version**: 1.0 Production Ready