# OSINT News Dashboard - Implementation Specifications

**Date**: January 12, 2026
**User**: Citizen journalist + news analyst (GA/US focused, global secondary)
**Status**: Ready for Cursor IDE development

---

## CONFIRMED SPECIFICATIONS

### 1. Geographic & Temporal Scope
- **Primary**: Georgia/US-focused
- **Secondary**: Global coverage
- **Temporal**: Real-time + historical (rolling 72-hour window minimum; archive queryable)

### 2. Formal Topic Taxonomy
- **Current state**: 6 formal topics (curated, with process-based efficacy evaluation)
- **Structure**: Specific categories (user to provide in development)
- **Auto-graduation rule**: Ad-hoc emergent topics that appear in 3+ articles over 24 hours → flag for promotion to formal topic status

### 3. Corroboration Thresholds (Source-Weighted)
```
Tier 1 (Geopolitical Crisis):     2 credible sources minimum
Tier 2 (Tech Breakthrough):        2 credible sources minimum
Tier 3 (Corporate Scandal):        3 credible sources minimum

Source Weighting Hierarchy:
  - Wire services (AP, Reuters, BBC, AFP):           1.0
  - Major newsrooms (NYT, FT, Guardian, WSJ):        0.95
  - Regional authorities (country-specific):         0.85
  - Specialized credible (Bloomberg, Ars Tech):      0.80
  - General tech/business (TechCrunch, VentureBeat): 0.60
  - Niche/specialist (context-dependent):            0.40-0.70
  - Unknown/emerging sources:                        0.30 (flagged)
```

### 4. Dashboard Structure
- **Visual Separation** between:
  - **Emergent Clustering**: "2+ articles, same event" → triggered by corroboration threshold
  - **Live Events**: "Designated active, tracking real-time updates" → triggered by velocity spike
- **Three dashboard sections**:
  - Tier 1 Elevated (Geopolitical crises)
  - Tier 2 Developing (Tech breakthroughs)
  - Tier 3 Monitoring (Corporate/other)
  - Live Stream (separate, real-time refresh)

### 5. GenAI Integration (Phase 1)
**In Scope**:
- Headline/content similarity detection (detecting exact-event matches despite language variation)
- Topic extraction (identifying emergent topics not in formal taxonomy)

**Out of Scope** (already implemented in app):
- Misinformation flagging
- Update summarization

**Note**: Both AI capabilities trigger human review/override capability

### 6. False Positive Recovery
**Three-path correction system**:

**Path A: Nothingburger Detection (Auto-demotion)**
- If story elevated but receives 0 new articles within 6-hour window → auto-flag as "stalled"
- Manual review accelerates demotion

**Path B: Prompt Re-engineering (Editorial Notes)**
- User can add editorial notes to source records
- Format: `[CORRECTION_NOTE: description of why tagging was wrong]`
- System learns from corrections (optional ML feedback loop)
- Placeholder reminder in UI

**Path C: Manual Override**
- User can explicitly rate elevation decisions (thumbs up/down)
- System logs feedback for efficacy tracking
- Rapid accumulation of negative feedback lowers source credibility weight

---

## ELEVATION ALGORITHM

```
STORY_ELEVATION_SCORE = (
    corroboration_level * 0.40 +
    topic_tier_weight * 0.30 +
    update_velocity * 0.15 +
    source_diversity * 0.10 +
    recency_decay * 0.05
)
WHERE:
  topic NOT IN (negative_topics_list)
  AND corroboration_threshold_met(topic_tier, source_weights)

CORROBORATION_LEVEL = 
    SUM(source_credibility_weights) / article_count

TOPIC_TIER_WEIGHT = {
    "Tier 1 (Geopolitical)":  1.0,
    "Tier 2 (Technology)":    0.85,
    "Tier 3 (Corporate)":     0.70,
    "Other/Ad-hoc":           0.50
}

UPDATE_VELOCITY = 
    articles_in_last_hour / baseline_frequency
    (normalized 0.0-1.0, capped at 2x baseline)

SOURCE_DIVERSITY = 
    unique_outlet_count / article_count
    (rewards independent corroboration)

RECENCY_DECAY = 
    max(0, 1 - (hours_since_first_article / 72))

DASHBOARD_TIER = {
    score >= 0.75:  "Tier 1 Elevated",
    score 0.50-0.75: "Tier 2 Developing",
    score 0.30-0.50: "Tier 3 Monitoring",
    score < 0.30:    "Archive (queryable only)"
}
```

---

## LIVE EVENT DETECTION

```
LIVE_EVENT_TRIGGER = (
    articles_count >= 5
    AND time_window <= 60 minutes
    AND corroboration_score >= threshold_for_tier
)
OR (
    headline_contains("live", "breaking", "developing", "as it unfolds")
    AND multiple_wire_services_reporting
    AND timestamp_current
)

LIVE_EVENT_METADATA = {
    creation_timestamp,
    update_frequency (articles/hour),
    source_list (with credibility),
    geographic_scope,
    latest_development (timestamped),
    key_details_timeline (reverse chronological),
    corroboration_status
}

LIVE_EVENT_LIFECYCLE = {
    active: update_frequency >= 1/hour OR manual_designation,
    cooling: update_frequency < 1/2hour AND last_update > 4 hours,
    closed: no_updates > 24 hours OR explicit_event_conclusion,
    resurgence: new_article_on_closed_story → reopen_automatically
}
```

---

## DATA MODEL (Pseudo-schema)

```
Story {
    id: uuid,
    topic_id: foreign_key,
    topic_tier: enum(Tier1, Tier2, Tier3, AdHoc),
    headline: string,
    first_article_timestamp: datetime,
    last_update_timestamp: datetime,
    article_cluster: [Article],
    corroboration_score: float(0-1),
    elevation_score: float(0-1),
    dashboard_tier: enum(Elevated, Developing, Monitoring, Archive),
    is_live_event: boolean,
    source_diversity: float(0-1),
    geographic_scope: [string],
    negative_topic_flags: [string],
    editorial_notes: [EditorialNote]
}

Article {
    id: uuid,
    source_record_id: foreign_key,
    headline: string,
    content_summary: string,
    url: string,
    published_timestamp: datetime,
    ingested_timestamp: datetime,
    source_credibility_weight: float,
    topic_match_confidence: float,
    is_ai_extracted_topic: boolean
}

EditorialNote {
    id: uuid,
    created_by: user_id,
    created_at: datetime,
    note_type: enum(CORRECTION_NOTE, FEEDBACK, OVERRIDE),
    content: string,
    affected_fields: [string]
}

Topic {
    id: uuid,
    name: string,
    tier: enum(Tier1, Tier2, Tier3),
    status: enum(formal, formal_pending_promotion, adhoc),
    keywords: [string],
    negative_keywords: [string],
    associated_sources: [SourceRecord],
    efficacy_score: float,
    auto_promotion_threshold: integer (default: 3 articles/24h)
}

LiveEvent {
    id: uuid,
    story_id: foreign_key,
    created_at: datetime,
    status: enum(active, cooling, closed),
    last_update_timestamp: datetime,
    update_frequency: float (articles/hour),
    update_feed: [UpdateEntry]
}

UpdateEntry {
    id: uuid,
    live_event_id: foreign_key,
    timestamp: datetime,
    change_summary: string,
    articles_added: [Article],
    key_detail_changed: string
}
```

---

## IMPLEMENTATION PHASES

### Phase 1: Core Corroboration Engine
- [ ] Ingest articles from existing source infrastructure
- [ ] Match against formal topic taxonomy
- [ ] Calculate corroboration scores with source weighting
- [ ] Implement elevation algorithm
- [ ] Basic dashboard API (list by tier)

### Phase 2: Emergent Topic Detection & Clustering
- [ ] GenAI headline similarity detection (detect exact-event matches)
- [ ] GenAI topic extraction (identify ad-hoc topics)
- [ ] Implement auto-graduation rules (3+ articles → flag for promotion)
- [ ] Create story cluster grouping logic

### Phase 3: Live Event Detection & Real-time Refresh
- [ ] Velocity spike detection (5+ articles/60 min)
- [ ] Semantic markers detection (headline keywords)
- [ ] Live event metadata accumulation
- [ ] Real-time update feed endpoint
- [ ] Lifecycle management (active → cooling → closed)

### Phase 4: False Positive Recovery & Manual Override
- [ ] Editorial notes system (with CORRECTION_NOTE placeholder UI)
- [ ] Manual rating system (thumbs up/down)
- [ ] Auto-demotion after 6-hour stall
- [ ] Feedback loop integration

### Phase 5: Public Dashboard & Visualization
- [ ] Three-tier dashboard sections
- [ ] Live stream separate view
- [ ] Detail view (source list, timeline, credibility notes)
- [ ] Archive search functionality
- [ ] Optional editorial commentary fields