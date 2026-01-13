# OSINT News Dashboard Implementation - Summary & Quick Start

**Generated**: January 12, 2026
**Status**: Ready for Cursor IDE development
**Three files created**:
1. `osint-dashboard-requirements.md` - Full editorial specifications
2. `osint-implementation-specs.md` - Technical specifications  
3. `cursor-prompt-dashboard.md` - Production-ready development prompt

---

## WHAT WAS DECIDED

### Your Use Case
- **You**: Citizen journalist + news analyst (GA/US primary, global secondary)
- **Mission**: Get to facts and right perspective; situational awareness for geopolitical/tech threats
- **Output**: Public-facing dashboard showing developing stories that matter

### The Three-Layer Architecture
1. **Ingestion Layer** (existing): RSS/API feeds → articles
2. **Analysis Layer** (existing): Fact/claim/truth evaluation → topic assignment
3. **Monitor Layer** (new): Corroboration clustering + live event detection → dashboard elevation

### Key Thresholds Confirmed

**Corroboration Thresholds**:
- Tier 1 (Geopolitical): 2 credible sources minimum
- Tier 2 (Technology): 2 credible sources minimum  
- Tier 3 (Corporate): 3 credible sources minimum

**Source Weighting** (credibility scale):
- Wire services (AP/Reuters/BBC): 1.0 (highest)
- Major newsrooms (NYT/FT): 0.95
- Specialized credible (Bloomberg): 0.80
- General tech (TechCrunch): 0.60
- Unknown sources: 0.30 (flagged)

**Elevation Algorithm** (weighted):
- Corroboration: 40% (your top priority)
- Topic tier: 30%
- Update velocity: 15%
- Source diversity: 10%
- Recency decay: 5%

**Dashboard Tiers**:
- Score ≥ 0.75: "Elevated" (prominent position)
- Score 0.50-0.75: "Developing" (grouped by topic)
- Score 0.30-0.50: "Monitoring" (lower visibility)
- Score < 0.30: Archive (searchable only)

**Two Visual Patterns** (visually separated):
1. **Emergent Clustering**: "2+ articles, same exact event" → appears in tier
2. **Live Events**: "Velocity spike or designated live" → separate real-time stream

**False Positive Recovery** (3-path):
1. Auto-demotion: Story with 0 new articles for 6 hours → marked stalled
2. Editorial notes: Add CORRECTION_NOTE explaining AI mis-tagging
3. Manual rating: Thumbs up/down on decisions

**GenAI Integration** (Phase 2):
- Headline similarity (find exact events despite language variation)
- Topic extraction (identify emergent topics not in formal taxonomy)

---

## FILES YOU'VE RECEIVED

### 1. `osint-dashboard-requirements.md`
**What it contains**:
- Full editorial specifications (11 sections)
- Audience & decision framework
- Domain & topic stratification (how to tier stories)
- Corroboration & clustering logic
- Live blog/real-time event detection rules
- Dashboard elevation criteria with weighting
- Integration with your existing systems
- Questions for implementation (open items)

**When to use**: Review for editorial understanding; reference during design

---

### 2. `osint-implementation-specs.md`
**What it contains**:
- Confirmed specifications matching your answers
- Elevation algorithm (pseudocode)
- Live event detection algorithm (pseudocode)
- Data models (Story, LiveEvent, Topic, UpdateEntry)
- Implementation phases (Phase 1-5 breakdown)

**When to use**: Reference for technical architecture; share with developers

---

### 3. `cursor-prompt-dashboard.md` ← **START HERE**
**What it contains** (753 lines):
- Complete context & mission
- Full data models (ready to implement)
- Four core algorithms with pseudocode:
  1. Corroboration Clustering
  2. Live Event Detection
  3. Topic Extraction & Auto-Promotion
  4. False Positive Recovery
- Three GenAI prompt templates (copy-paste ready)
- API endpoints (mock specifications)
- Configuration parameters (as environment variables)
- Implementation checklist (Phase 1-6)
- Testing strategy
- Notes on gotchas & deployment

**When to use**: **Copy entire file into Cursor IDE and start development**

---

## HOW TO USE THESE FILES

### Immediate (Today)
1. ✅ You have all three files downloaded
2. Read `osint-dashboard-requirements.md` (understand editorial logic)
3. Skim `osint-implementation-specs.md` (understand data model)

### This Week (Development Begins)
1. **Copy entire `cursor-prompt-dashboard.md` into Cursor IDE**
2. **Start Phase 1**: Implement Story/LiveEvent/Topic data models
3. Build corroboration clustering algorithm
4. Test with real articles from your existing feeds
5. Get basic dashboard API working

### Week 2-3
1. Phase 2: GenAI integration (headline similarity + topic extraction)
2. Phase 3: Live event detection
3. Phase 4: False positive recovery

### Week 4+
1. Phase 5: Dashboard UI (three tiers + live stream)
2. Phase 6: Ad-hoc topic management
3. Full testing + deployment

---

## KEY ARCHITECTURAL INSIGHTS

### Why This Design Works for You

1. **Corroboration-first**: You said corroboration matters most → it's 40% of elevation score
2. **Topic tiering**: Geopolitical crisis (your main concern) gets highest weight (1.0)
3. **Velocity as signal**: Rapid updates = likely developing story (15% weight)
4. **No false negatives**: 2-source threshold catches what matters
5. **False positive tolerance**: Stall detection (6 hours) + manual override prevents junk
6. **Public credibility**: Transparent source lists + corroboration metrics build trust

### Technical Strengths

- **Parametric**: All thresholds are environment variables (tune without code changes)
- **Scalable**: Runs as separate microservice from ingestion/analysis layers
- **Auditable**: Every elevation/demotion decision is logged with reasoning
- **Recoverable**: Editorial notes + manual ratings allow system to learn from mistakes
- **Separable**: Emergent clustering and live events are distinct patterns (won't confuse)

### OPSEC Considerations

- All calculations server-side (no user data sent to GenAI)
- Editorial corrections logged for audit trail
- Source weights tunable without re-ranking all stories
- Negative topic list is revocable (suppress without deletion)

---

## WHAT COMES NEXT

### Phase 1 Deliverables (First Week)
- [ ] Story, LiveEvent, Topic database models created
- [ ] Corroboration clustering algorithm implemented
- [ ] Source weighting logic working
- [ ] Elevation scoring functional
- [ ] Dashboard API endpoint (GET /dashboard) returns data
- [ ] Test against 24 hours of real articles

### Phase 1 Success Criteria
- Real geopolitical stories (2+ sources) appear in Tier 1 Elevated
- Tech news (2+ sources) appears in Tier 2 Developing
- Corporate stories (3+ sources) appears in Tier 3 Monitoring
- No false elevations (nothingburgers)
- Stories auto-demote after 6 hours with no updates

### After Phase 1
- Phases 2-6 follow sequentially
- Each phase builds on previous
- You'll have working MVP by end of Phase 1

---

## QUICK REFERENCE: COPY-PASTE VALUES

**For your config/environment file**:
```
CORROBORATION_TIER1_SOURCES_NEEDED=2
CORROBORATION_TIER2_SOURCES_NEEDED=2
CORROBORATION_TIER3_SOURCES_NEEDED=3

LIVE_EVENT_ARTICLE_THRESHOLD=5
LIVE_EVENT_TIME_WINDOW_MINUTES=60
LIVE_EVENT_UPDATE_FREQUENCY_COOLDOWN_HOURS=4
LIVE_EVENT_CLOSURE_HOURS=24

ELEVATION_SCORE_TIER1_CUTOFF=0.75
ELEVATION_SCORE_TIER2_CUTOFF=0.50
ELEVATION_SCORE_TIER3_CUTOFF=0.30

STALL_DETECTION_HOURS=6
STALL_DETECTION_NEW_ARTICLES_THRESHOLD=0

ADHOC_TOPIC_PROMOTION_THRESHOLD=3
ADHOC_TOPIC_PROMOTION_WINDOW_HOURS=24

PRIMARY_GEOGRAPHY="US,GA"
SECONDARY_GEOGRAPHY="Global"
GEOGRAPHY_BOOST_FACTOR=1.2
```

---

## SOURCE WEIGHT QUICK REFERENCE

Use these in your code:
```
Wire services (AP, Reuters, BBC, AFP):           1.0
Major newsrooms (NYT, FT, Guardian, WSJ):        0.95
Regional authorities:                             0.85
Specialized credible (Bloomberg, Ars Tech):      0.80
General tech/business (TechCrunch, VentureBeat): 0.60
Niche/specialist (context-dependent):            0.40-0.70
Unknown/emerging sources:                        0.30 (flagged)
```

---

## FINAL ADVICE

**This is production-ready architecture.** Every algorithm, data model, and API endpoint is specified to implement immediately.

**Key strengths**:
- You're building an intelligent editorial filter, not a dumb aggregator
- Corroboration logic + elevation scoring make it suitable for professional use
- False positive recovery keeps system trustworthy long-term
- Scalable from MVP to enterprise

**Next step**: Start Phase 1 with Cursor IDE. You'll have a working MVP within days.

**Questions during development**: You know where to find me in this space.

---

Good luck building this. It's a valuable contribution to citizen journalism and OSINT practice.
