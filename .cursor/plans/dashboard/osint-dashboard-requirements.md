# OSINT News Dashboard: Editorial Requirements & Architecture

**Date**: January 12, 2026
**Primary User**: Citizen journalist + news analyst (public-facing capability)
**Mission**: Get to facts and right perspective; situational awareness for geopolitical/tech threats

---

## I. AUDIENCE & DECISION FRAMEWORK

### Primary Consumer
- **You** (analyst/producer), but **public-facing** (builds credibility through transparency)
- **Decision**: Allocate reporting effort; inform stakeholder communication; update personal/professional situational awareness

### Error Cost Analysis
- **False Positive**: Story lacks substantive development OR requires prompt re-engineering → **Medium Cost** (wasted attention, editorial credibility hit)
- **False Negative**: Missing meaningful story development → **High Cost** (gaps in awareness, professional credibility gap)
- **Implication**: Bias toward **inclusion with curation** rather than aggressive filtering

---

## II. DOMAIN & TOPIC STRATIFICATION

### Topic Classification (Tiered by Impact)
1. **Tier 1 - Existential**: Geopolitical crises (bearing on you/spouse's work directly)
2. **Tier 2 - Strategic**: Technology breakthroughs (professional/personal impact)
3. **Tier 3 - Contextual**: Corporate scandal (situational awareness value)
4. **Tier 4 - Noise**: Topics explicitly marked as "don't care about"

### Topic Taxonomy Structure
**Current State** (Existing):
- Formal Topics (curated, process-validated, keyword-enabled)
- Associated Source Records (RSS feeds, API sources)
- Efficacy tracking per topic
- Fact/claim/truth evaluation built-in

**New State** (Dashboard Addition):
- Keep formal taxonomy
- Add **ad-hoc emergent topics** (detected but not formally tracked)
- Add **negative topic list** (explicitly excluded from elevation)
- Maintain **unknowns awareness** (emerging topics you haven't categorized yet)

### Sourcing Hierarchy
- **Formal Topics** → curated sourcing → high confidence
- **Ad-hoc topics** → may have weaker sourcing → needs flagging
- **Negative topics** → actively suppressed from dashboard elevation

---

## III. TIME SENSITIVITY & VELOCITY

### Target Response Time
- **Dashboard update latency**: Minutes (real-time ingestion from feeds)
- **Story elevation latency**: 5-15 min (allow multi-source corroboration window)

### Narrative Tracking Model
- Focus on **topic development** (how story evolves), not just emergence
- Track **update velocity** as signal:
  - High velocity (1+ update/hour for 2+ hours) = developing story
  - Decaying velocity = story cooling off
  - Flat velocity then spike = new development

### Content Classification
- Embargoed/scheduled: **Timestamp-based** (respect publication times in feeds)
- Breaking: **Real-time from wire services** (immediate elevation path)

---

## IV. CORROBORATION & CLUSTERING LOGIC

### Elevation Criterion: Exact Event Matching (with source weighting)

**Algorithm Pattern**:
```
IF (article_count >= 2) 
  AND (topic_match = "exact_event")
  AND (corroboration_score >= threshold)
  THEN elevate_to_dashboard

WHERE corroboration_score = 
  SUM(source_credibility_weights) / article_count
  WEIGHTED_BY time_velocity
```

### Source Credibility Tiers (Weighting)
1. **Primary wire services** (AP, Reuters, BBC, AFP): Weight 1.0
2. **Major newsrooms** (NYT, FT, Guardian, WSJ): Weight 0.95
3. **Regional authorities** (country-specific quality outlets): Weight 0.85
4. **Specialized but credible** (financial: Bloomberg; tech: Verge; security: Ars Technica): Weight 0.80
5. **General tech/business** (TechCrunch, VentureBeat, etc.): Weight 0.60
6. **Niche/specialist sources** (depends on topic): Weight 0.40-0.70
7. **Unknown/emerging sources**: Weight 0.30 (flag for review)

### PR Cascade Handling
**Rule**: If N articles all cite same source (e.g., company press release):
- **Legitimate case**: "Company announces acquisition" → confirmation across sources validates legitimacy
- **Concern case**: Multiple outlets covering company's "serious claims" → flag editorial quality (are they fact-checking?)
- **Action**: Don't suppress, but **add metadata**: "PR-sourced: X% of coverage traces to original statement"

---

## V. LIVE BLOG / REAL-TIME EVENT DETECTION

### Automatic Live Story Designation
**Trigger Conditions** (rules-based):
1. **Velocity spike**: 5+ articles on exact topic within 60 minutes
2. **Semantic markers**: Keywords in headlines/lede indicating ongoing development
   - "As it unfolds," "Live updates," "Developing story"
   - Time-relative language: "Just in," "Breaking," "Latest"
3. **Source density**: Multiple wire services (AP, Reuters, BBC) all reporting simultaneously
4. **Geographic proximity to user**: If story directly impacts your region/interests

### Live Story Metadata
- **Creation timestamp**: First article triggering live designation
- **Update frequency**: Articles/hour (velocity indicator)
- **Source list**: Who's covering it (helps assess corroboration)
- **Key details evolution**: What changed from update 1 to current update
- **Geographic scope**: Where story is happening vs. where it's being covered

### Lifecycle & Closure
**Story closes when**:
- Update velocity drops below threshold (e.g., 1 article/2 hours) for sustained 4+ hour window
- **OR** explicit event conclusion marker detected ("situation concluded," "investigation closed")
- **BUT** remains accessible in archive for 72 hours in case of resurgence
- **Resurgence rule**: If new development on closed story appears, re-open live blog automatically

---

## VI. DASHBOARD ELEVATION CRITERIA

### Weighting Logic (Journalist's Judgment Encoded)

**Base Score Calculation**:
```
elevation_score = (
  corroboration_level * 0.40 +     # Your top weight
  topic_tier * 0.30 +              # Tier 1 (geo crisis) > Tier 3 (scandal)
  update_velocity * 0.15 +         # Rapid updates = developing
  source_diversity * 0.10 +        # Geographic/outlet spread
  recency_decay * 0.05             # Freshness (decay over hours)
) WHERE topic NOT IN (negative_topics)
```

### Dashboard Appearance Rules

**Tier 1 Stories** (elevation_score > 0.75):
- Immediate dashboard appearance
- Prominent position
- Auto-refresh on new articles
- Full metadata + source list visible

**Tier 2 Stories** (elevation_score 0.50-0.75):
- Dashboard section: "Developing"
- Grouped by topic
- Updates every 5-10 min
- Source credibility visible

**Tier 3 Stories** (elevation_score 0.30-0.50):
- Dashboard section: "Monitoring"
- Less frequent refresh (15-30 min)
- Archive-ready but lower visibility

**Below threshold** (elevation_score < 0.30):
- Still queryable via search
- Not dashboard-elevated
- Available to AI analysis layer

### False Positive Mitigation

**You said**: "False positive = nothingburger OR requires prompt re-engineering"

**Approach**:
1. **Nothingburger detection**: If topic was elevated but receives no new articles within 6 hours → flag as "stalled story" (not upgraded further)
2. **Prompt quality feedback**: If AI analysis layer generated misleading tags/prompts → add editorial note to source record
3. **Manual correction loop**: You can rate stories post-elevation (thumbs up = good call; thumbs down = false positive); machine learns weighting adjustments

---

## VII. LIVE BLOG / REAL-TIME STREAM PATTERN

### Designated Live Event Structure

**Separate from "emergent topic clustering"** — requires explicit live status

**Live Blog Entry Contains**:
- **Headline** (evolving as story develops)
- **Current situation** (latest development at top)
- **Timeline** (reverse chronological: what just happened → what happened first)
- **Source chain** (where information came from; credibility note)
- **Key details** (facts confirmed across multiple sources)
- **Unconfirmed reports** (clearly marked; what we're waiting on)
- **Context** (background, why it matters)

**Metadata**:
- Live status indicator
- Time since last update
- Update frequency (# updates/hour)
- Geographic scope
- Articles linked to this live event
- Corroboration status

---

## VIII. INTEGRATING WITH YOUR EXISTING SYSTEMS

### Data Flow

```
RSS Feeds / API Sources
    ↓
[Source Records + Topic Assignment]
    ↓
[Fact/Claim Evaluation + Keyword Matching]
    ↓
[Formal Topic Taxonomy Matching]
    ↓
[Dashboard Logic Engine]
    ├─ Corroboration clustering
    ├─ Live event detection
    ├─ Elevation scoring
    └─ Negative topic filtering
    ↓
[Dashboard Presentation Layer]
    └─ Tier 1/2/3 visualization
```

### GenAI Prompt Integration Points

**Use cases where AI assists**:
1. **Headline similarity matching**: Detect exact-event clustering even when language varies
2. **Topic extraction**: Identify emergent topics not in your formal taxonomy
3. **Context insertion**: Generate "why this matters" summary
4. **Misinformation flagging**: Detect inconsistencies in claims across sources
5. **Update summarization**: Generate concise "what changed" between articles on same story

**But require human approval** for:
- Elevation decisions (you review, optionally override scores)
- Live story designation (recommend, but you confirm)
- Fact/truth assessment (AI flags; you validate)

---

## IX. DASHBOARD REMOVAL & ARCHIVING

### Lifecycle Management

**How stories disappear from dashboard**:
- **Automatic de-elevation**: Score drops below threshold after topic ages
- **Topic-based removal**: If associated topic marked "no longer monitoring" → story removed
- **Manual dismissal**: You can explicitly "archive" a story
- **Time-based**: Stories >72 hours old move to archive (unless still accumulating updates)

**Archive remains queryable** for historical context and resurgence detection.

---

## X. OPEN QUESTIONS FOR IMPLEMENTATION

1. **Velocity threshold for live designation**: 5 articles/60 min? Configurable per topic tier?
2. **Update cascade timing**: How long to wait for corroboration before elevation? (Currently assuming 5-15 min)
3. **Negative topic scoping**: Should negative topics suppress related stories? (E.g., "Celebrity gossip" suppresses ALL celebrity stories, or only gossip-specific?)
4. **Geographic weighting**: Does proximity to Jefferson, GA matter? (Elevate local stories automatically?)
5. **Formal vs. ad-hoc topic balance**: Should ad-hoc topics automatically graduate to formal topics after X articles?
6. **Confidence scoring visibility**: Should dashboard show "70% confidence" or "high confidence" (human-readable)?

---

## XI. CURSOR IDE PROMPT (Next Step)

Once you confirm the above, I'll generate a concise, implementation-ready prompt for your development environment that covers:
- Data model (Story, Topic, Corroboration, Live Event)
- Elevation algorithm with configurable thresholds
- Live event detection logic
- Dashboard API endpoints
- Refresh and caching strategy
- Error handling and edge cases