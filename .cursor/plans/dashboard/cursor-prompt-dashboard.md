# CURSOR IDE PROMPT: OSINT News Dashboard (3-Layer System)

**Copy this entire prompt into Cursor IDE when ready to begin implementation.**

---

## CONTEXT & MISSION

You are building a **news analysis dashboard** for a citizen journalist and OSINT analyst focused on GA/US news with global secondary coverage. The goal is not to aggregate all news, but to identify **developing stories** that meet editorial standards for corroboration, source credibility, and situational importance.

**Key Intelligence Principle**: Corroboration matters more than volume. A story reported by AP + Reuters is more newsworthy than a story in 15 tech blogs.

---

## SYSTEM ARCHITECTURE (3 Layers)

### Layer 1: NEWS INGESTION (Existing)
Your app already ingests from RSS feeds and APIs, associates articles with formal topics, and tracks fact/claim/truth evaluation. This layer remains unchanged.

### Layer 2: NEWS ANALYSIS (Existing)
Your app already evaluates efficacy of topics, quality of sourcing, and fact-checking. This layer remains unchanged.

### Layer 3: NEWS MONITOR (New - This Prompt)
The dashboard that:
- Detects when multiple credible sources cover the same event (corroboration clustering)
- Identifies rapid-fire updates indicating a developing story (live event detection)
- Elevates stories to prominence based on editorial weighting (Tier 1/2/3)
- Separates emergent clustering from live real-time streams (two visual patterns)
- Allows manual correction when AI mis-tags stories

---

## DATA MODEL

**Implement these entities in your database:**

```
Story {
  id: UUID,
  topic_id: UUID (foreign key to Topic),
  topic_tier: enum["Tier1_Geopolitical", "Tier2_Technology", "Tier3_Corporate", "AdHoc"],
  headline: string (normalized from first article or AI-generated),
  first_article_timestamp: ISO8601,
  last_update_timestamp: ISO8601,
  article_ids: [UUID] (references to Article records already in your DB),
  corroboration_score: float (0.0-1.0),
  elevation_score: float (0.0-1.0),
  dashboard_tier: enum["Elevated", "Developing", "Monitoring", "Archive"],
  is_live_event: boolean,
  source_diversity: float (0.0-1.0),
  geographic_scope: [string] (e.g., ["Georgia", "US", "Global"]),
  negative_topic_flags: [string] (topics explicitly excluded),
  editorial_notes: [
    {
      id: UUID,
      created_at: ISO8601,
      note_type: enum["CORRECTION_NOTE", "FEEDBACK", "OVERRIDE"],
      content: string,
      affected_fields: [string]
    }
  ],
  created_at: ISO8601,
  updated_at: ISO8601
}

LiveEvent {
  id: UUID,
  story_id: UUID (foreign key to Story),
  created_at: ISO8601,
  status: enum["active", "cooling", "closed"],
  last_update_timestamp: ISO8601,
  update_frequency: float (articles per hour),
  update_feed: [
    {
      timestamp: ISO8601,
      change_summary: string,
      article_ids_added: [UUID],
      key_detail_changed: string
    }
  ]
}

Topic {
  id: UUID,
  name: string,
  tier: enum["Tier1", "Tier2", "Tier3"],
  status: enum["formal", "formal_pending_promotion", "adhoc"],
  keywords: [string],
  negative_keywords: [string],
  associated_source_ids: [UUID],
  efficacy_score: float,
  auto_promotion_threshold: integer (default: 3),
  created_at: ISO8601
}
```

---

## CORE ALGORITHMS

### Algorithm 1: CORROBORATION CLUSTERING

**Purpose**: When 2+ credible sources independently report the same event, elevate it as a story.

**Implementation**:

```
FUNCTION detectStoryCluster(articles: Array<Article>) -> Array<Story> {
  
  // Step 1: Group articles by topic
  const groupedByTopic = groupArticlesByFormalTopic(articles);
  
  FOR EACH topicGroup IN groupedByTopic {
    
    // Step 2: For each topic, find articles covering the SAME EVENT
    // Use GenAI headline similarity + metadata matching
    const eventClusters = clusterByExactEvent(
      articles: topicGroup,
      similarity_threshold: 0.85,  // Headline/content similarity
      time_window: 3600000  // 1 hour
    );
    
    FOR EACH cluster IN eventClusters {
      
      // Step 3: Calculate corroboration score
      const sourceWeights = {
        "AP": 1.0, "Reuters": 1.0, "BBC": 1.0, "AFP": 1.0,
        "NYT": 0.95, "FT": 0.95, "Guardian": 0.95, "WSJ": 0.95,
        "Bloomberg": 0.80, "ArsT echnica": 0.80,
        "TechCrunch": 0.60, "VentureBeat": 0.60,
        // ... extend based on source database
      };
      
      const corroborationScore = 
        SUM(sourceWeights[article.source] for each article in cluster) 
        / cluster.article_count;
      
      // Step 4: Check if threshold met for topic tier
      const tier = getTier(cluster.topic_id);
      const thresholdMet = checkCorroborationThreshold(
        tier: tier,
        score: corroborationScore,
        articlesNeeded: tier == "Tier1" ? 2 : tier == "Tier2" ? 2 : 3
      );
      
      IF thresholdMet {
        
        // Step 5: Create/update Story record
        const story = createOrUpdateStory({
          topic_id: cluster.topic_id,
          topic_tier: tier,
          headline: generateNormalizedHeadline(cluster.articles),
          article_ids: cluster.article_ids,
          corroboration_score: corroborationScore,
          source_diversity: calculateSourceDiversity(cluster.articles)
        });
        
        // Step 6: Calculate elevation score
        story.elevation_score = calculateElevationScore(story);
        story.dashboard_tier = determineDashboardTier(story.elevation_score);
        
        // Step 7: Check for false positives (6-hour stall detection)
        IF story.is_stalled(hours: 6) {
          story.dashboard_tier = "Archive";
          flagForManualReview(story, reason: "No update for 6 hours");
        }
        
        RETURN story;
      }
    }
  }
}

// Helper: Detect exact-event matches despite headline variation
FUNCTION clusterByExactEvent(
  articles: Array<Article>,
  similarity_threshold: float,
  time_window: milliseconds
) -> Array<Cluster> {
  
  // Use GenAI to detect semantic similarity
  // PROMPT: "Are these two headlines describing the same event or different angles on related events?"
  
  const clusters = [];
  const processed = new Set();
  
  FOR EACH article IN articles {
    IF article.id IN processed CONTINUE;
    
    const cluster = { articles: [article] };
    processed.add(article.id);
    
    FOR EACH other IN articles {
      IF other.id IN processed CONTINUE;
      IF other.published_timestamp - article.published_timestamp > time_window CONTINUE;
      
      const similarity = genAI_headlineSimilarity(
        article.headline,
        other.headline,
        threshold: similarity_threshold
      );
      
      IF similarity >= similarity_threshold {
        cluster.articles.push(other);
        processed.add(other.id);
      }
    }
    
    clusters.push(cluster);
  }
  
  RETURN clusters;
}

// Helper: Calculate elevation score
FUNCTION calculateElevationScore(story: Story) -> float {
  
  const topicTierWeights = {
    "Tier1_Geopolitical": 1.0,
    "Tier2_Technology": 0.85,
    "Tier3_Corporate": 0.70,
    "AdHoc": 0.50
  };
  
  const updateVelocity = calculateUpdateVelocity(story);
  const sourceDiversity = story.source_diversity;  // Already calculated
  const recencyDecay = calculateRecencyDecay(story.first_article_timestamp);
  
  const score = (
    story.corroboration_score * 0.40 +
    topicTierWeights[story.topic_tier] * 0.30 +
    updateVelocity * 0.15 +
    sourceDiversity * 0.10 +
    recencyDecay * 0.05
  );
  
  // Check negative topics
  IF storyMatchesNegativeTopic(story) {
    RETURN score * 0.5;  // Suppress by 50%
  }
  
  RETURN Math.min(score, 1.0);
}

// Helper: Determine dashboard tier
FUNCTION determineDashboardTier(score: float) -> string {
  IF score >= 0.75 RETURN "Elevated";
  IF score >= 0.50 RETURN "Developing";
  IF score >= 0.30 RETURN "Monitoring";
  RETURN "Archive";
}
```

---

### Algorithm 2: LIVE EVENT DETECTION

**Purpose**: When a story receives rapid updates (5+ articles in 60 min), designate it as "live" and start real-time tracking.

**Implementation**:

```
FUNCTION detectLiveEvent(story: Story) -> LiveEvent | null {
  
  // Trigger 1: Velocity spike
  const articlesLast60Min = story.articles
    .filter(a => now() - a.published_timestamp < 3600000)
    .length;
  
  const isVelocitySpike = articlesLast60Min >= 5;
  
  // Trigger 2: Semantic markers
  const hasLiveMarkers = story.articles.some(a =>
    a.headline.toLowerCase().match(
      /live|breaking|developing|as it unfolds|just in|latest/
    )
  );
  
  // Trigger 3: Multiple wire services reporting
  const wireServices = ["AP", "Reuters", "BBC", "AFP"];
  const wireServicesReporting = story.articles
    .filter(a => wireServices.includes(a.source_name))
    .length >= 2;
  
  IF (isVelocitySpike || hasLiveMarkers) AND wireServicesReporting {
    
    const liveEvent = {
      id: generateUUID(),
      story_id: story.id,
      created_at: now(),
      status: "active",
      last_update_timestamp: now(),
      update_frequency: articlesLast60Min / 60,  // Articles per minute
      update_feed: generateUpdateFeed(story)
    };
    
    saveLiveEvent(liveEvent);
    story.is_live_event = true;
    saveStory(story);
    
    RETURN liveEvent;
  }
  
  RETURN null;
}

// Helper: Generate update feed from article history
FUNCTION generateUpdateFeed(story: Story) -> Array<UpdateEntry> {
  
  const feed = [];
  const sortedArticles = story.articles.sort(
    (a, b) => b.published_timestamp - a.published_timestamp
  );
  
  FOR EACH article IN sortedArticles {
    
    // Generate simple summary of what changed
    const changeSummary = genAI_generateUpdateSummary(
      current_article: article,
      previous_articles: sortedArticles.slice(0, sortedArticles.indexOf(article))
    );
    // PROMPT: "Summarize what NEW information this article adds compared to previous reporting on this story. Keep to 1-2 sentences."
    
    feed.push({
      timestamp: article.published_timestamp,
      change_summary: changeSummary,
      article_ids_added: [article.id],
      key_detail_changed: extractKeyDetail(article)  // Geolocation? Casualty count? New official statement?
    });
  }
  
  RETURN feed;
}

// Helper: Manage live event lifecycle
FUNCTION manageLiveEventLifecycle(liveEvent: LiveEvent) {
  
  const timeSinceLastUpdate = now() - liveEvent.last_update_timestamp;
  const articlesLast2Hours = countArticlesSince(liveEvent.story_id, 7200000);
  
  // Status transitions
  IF timeSinceLastUpdate > 14400000 AND articlesLast2Hours < 2 {
    // No updates for 4+ hours AND fewer than 2 articles in last 2 hours
    liveEvent.status = "cooling";
  }
  
  IF timeSinceLastUpdate > 86400000 {
    // No updates for 24+ hours
    liveEvent.status = "closed";
  }
  
  // Resurgence: If new article appears on closed story, reopen
  IF liveEvent.status == "closed" AND newArticleOnStory(liveEvent.story_id) {
    liveEvent.status = "active";
    liveEvent.update_feed = regenerateUpdateFeed(liveEvent.story_id);
  }
  
  saveLiveEvent(liveEvent);
}
```

---

### Algorithm 3: TOPIC EXTRACTION & AUTO-PROMOTION

**Purpose**: Detect emergent topics not in formal taxonomy; auto-promote ad-hoc topics if they sustain.

**Implementation**:

```
FUNCTION extractEmergentTopics(articles: Array<Article>) {
  
  FOR EACH article IN articles {
    
    // If article doesn't match formal topic, use GenAI to extract topic
    IF !article.has_formal_topic_match {
      
      const extractedTopic = genAI_extractTopic(
        headline: article.headline,
        content_summary: article.content_summary
      );
      // PROMPT: "Extract the core topic/subject of this news story. Return: { topic_name: string, likely_tier: string (Tier1|Tier2|Tier3|Other) }. Example: { topic_name: 'Taiwan military exercises', likely_tier: 'Tier1' }"
      
      // Create ad-hoc topic record
      const adhocTopic = findOrCreateTopic({
        name: extractedTopic.topic_name,
        tier: extractedTopic.likely_tier,
        status: "adhoc"
      });
      
      article.topic_id = adhocTopic.id;
      saveArticle(article);
      
      // Track how many articles match this topic
      adhocTopic.article_count = countArticlesForTopic(adhocTopic.id);
      
      // Auto-promotion rule: 3+ articles in 24 hours → flag for formal promotion
      IF adhocTopic.article_count >= 3 
         AND hoursOld(adhocTopic) <= 24
         AND adhocTopic.status == "adhoc" {
        
        adhocTopic.status = "formal_pending_promotion";
        flagForManualReview(
          adhocTopic,
          reason: `Emergent topic with ${adhocTopic.article_count} articles, recommend promotion to formal topic`
        );
      }
      
      saveTopic(adhocTopic);
    }
  }
}
```

---

### Algorithm 4: FALSE POSITIVE RECOVERY

**Purpose**: Handle nothingburgers, incorrect AI tagging, and manual overrides.

**Implementation**:

```
FUNCTION handleFalsePositiveRecovery(story: Story) {
  
  // Path A: Auto-demotion for stalled stories
  FUNCTION autoDetectStall(story: Story) {
    const timeSinceLastArticle = now() - story.last_update_timestamp;
    const newArticlesInWindow = story.articles
      .filter(a => now() - a.published_timestamp < 3600000)
      .length;
    
    IF timeSinceLastArticle > 21600000  // 6 hours
       AND newArticlesInWindow == 0
       AND story.dashboard_tier != "Archive" {
      
      story.dashboard_tier = "Archive";
      addEditorialNote(story, {
        note_type: "AUTO_FLAG",
        content: "Story stalled: no new articles for 6+ hours. Manual review recommended."
      });
      
      saveStory(story);
    }
  }
  
  // Path B: Manual correction notes (you'll add these in UI)
  FUNCTION applyEditorialNote(story: Story, note: EditorialNote) {
    
    IF note.note_type == "CORRECTION_NOTE" {
      // [PLACEHOLDER for UI reminder]
      // UI Template:
      // ====================
      // CORRECTION_NOTE Format:
      // When adding a correction note, describe what was incorrectly tagged or analyzed.
      // Example: "This story was mis-tagged as Tier1_Geopolitical but is actually Tier3_Corporate. 
      //          The headline 'China official visits Taiwan' is diplomatic routine, not crisis."
      // This helps retrain the system for future similar stories.
      // ====================
      
      // Log the correction for system learning
      logCorrectionFeedback({
        story_id: story.id,
        correction: note.content,
        affected_fields: note.affected_fields
      });
      
      // Adjust topic tier or exclusion if needed
      IF "topic_tier" IN note.affected_fields {
        const newTier = extractTierFromNote(note.content);
        story.topic_tier = newTier;
      }
    }
    
    IF note.note_type == "FEEDBACK" {
      // Rate elevation decision
      logFeedback({
        story_id: story.id,
        feedback: note.content,
        rating: extractRatingFromNote(note.content)  // "thumbs_up" or "thumbs_down"
      });
    }
    
    story.editorial_notes.push(note);
    saveStory(story);
  }
  
  // Path C: Manual override via UI rating
  FUNCTION handleManualRating(story: Story, rating: "thumbs_up" | "thumbs_down") {
    
    IF rating == "thumbs_down" {
      // User says "this shouldn't have been elevated"
      story.dashboard_tier = "Archive";
      
      // If pattern emerges (multiple thumbs_down on similar stories),
      // flag source credibility for review
      const sourceCredibilityImpact = -0.05;
      updateSourceCredibilityWeight(story.articles[0].source, sourceCredibilityImpact);
    }
    
    IF rating == "thumbs_up" {
      // User confirms this was a good elevation
      // Boost similar future stories slightly
      recordPositiveFeedback(story);
    }
  }
}
```

---

## GENAI INTEGRATION POINTS

### 1. Headline Similarity Matching
**When**: Clustering articles into stories
**Prompt Template**:
```
Given these two news headlines, determine if they describe the SAME event/story or different stories.
Return: { same_event: boolean, confidence: 0.0-1.0, explanation: string }

Headline 1: "{headline1}"
Headline 2: "{headline2}"

Context:
- Published within {time_window_minutes} minutes
- Related topic: {topic_name}

Be strict: "Tesla reports earnings" ≠ "Musk sued in shareholder case" even if both mention Tesla.
But: "Taiwan military exercises begin" = "Chinese jets conduct drills near Taiwan" (same event, different angles).
```

### 2. Topic Extraction
**When**: Article doesn't match formal taxonomy
**Prompt Template**:
```
Extract the core journalistic topic from this news story.

Headline: "{headline}"
Lede/Summary: "{content_summary}"

Return a JSON object:
{
  "topic_name": "[specific topic, e.g., 'Taiwan military exercises', 'AI regulation proposal', 'Meta layoffs']",
  "likely_tier": "[Tier1 (geopolitical crisis), Tier2 (technology), Tier3 (corporate), or Other]",
  "keywords": [list of 3-5 keywords for future matching]
}

Examples:
- Headline: "Ukraine reports new Russian offensive near Dnipro"
  → { topic_name: "Ukraine offensive operations", likely_tier: "Tier1", keywords: ["Ukraine", "Russia", "Dnipro", "offensive"] }
  
- Headline: "OpenAI releases GPT-5, company values at $200B"
  → { topic_name: "OpenAI GPT-5 release", likely_tier: "Tier2", keywords: ["OpenAI", "GPT", "AI model", "release"] }
```

---

## API ENDPOINTS (Mock Specs)

Implement these endpoints in your news monitor layer:

```
GET /dashboard
  Returns: {
    elevated_stories: [Story],
    developing_stories: [Story],
    monitoring_stories: [Story],
    live_events: [LiveEvent]
  }

GET /story/:story_id
  Returns: Story (with article_details, editorial_notes, timeline)

GET /live/:live_event_id
  Returns: LiveEvent (with update_feed, real-time refresh data)

POST /story/:story_id/note
  Body: { note_type: "CORRECTION_NOTE"|"FEEDBACK", content: string }
  Returns: updated Story

POST /story/:story_id/rating
  Body: { rating: "thumbs_up"|"thumbs_down" }
  Returns: { status: "recorded" }

GET /topics/pending-promotion
  Returns: [Topic] (ad-hoc topics ready for formal promotion)

POST /topics/:topic_id/promote
  Promote ad-hoc topic to formal
  Returns: updated Topic
```

---

## CONFIGURATION & THRESHOLDS

Set these as environment variables or config file:

```
// Corroboration
CORROBORATION_TIER1_SOURCES_NEEDED=2
CORROBORATION_TIER2_SOURCES_NEEDED=2
CORROBORATION_TIER3_SOURCES_NEEDED=3

// Live events
LIVE_EVENT_ARTICLE_THRESHOLD=5
LIVE_EVENT_TIME_WINDOW_MINUTES=60
LIVE_EVENT_UPDATE_FREQUENCY_COOLDOWN_HOURS=4
LIVE_EVENT_CLOSURE_HOURS=24

// Elevation scoring
ELEVATION_SCORE_TIER1_CUTOFF=0.75
ELEVATION_SCORE_TIER2_CUTOFF=0.50
ELEVATION_SCORE_TIER3_CUTOFF=0.30

// False positive recovery
STALL_DETECTION_HOURS=6
STALL_DETECTION_NEW_ARTICLES_THRESHOLD=0

// Topic auto-promotion
ADHOC_TOPIC_PROMOTION_THRESHOLD=3
ADHOC_TOPIC_PROMOTION_WINDOW_HOURS=24

// Geographic focus
PRIMARY_GEOGRAPHY="US,GA"
SECONDARY_GEOGRAPHY="Global"
GEOGRAPHY_BOOST_FACTOR=1.2  // Boost elevation score for primary geography
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Corroboration Engine (MVP)
- [ ] Implement Story, LiveEvent, Topic data models
- [ ] Build corroboration clustering algorithm (detect 2+ sources)
- [ ] Calculate source credibility weights
- [ ] Implement elevation scoring with correct weighting
- [ ] Create dashboard API endpoints (GET /dashboard)
- [ ] Test with real articles from your existing feed

### Phase 2: GenAI Integration
- [ ] Integrate headline similarity detection (GenAI)
- [ ] Integrate topic extraction (GenAI)
- [ ] Test on 100+ articles; measure false positive rate
- [ ] Adjust similarity threshold if needed

### Phase 3: Live Event Detection
- [ ] Implement velocity spike detection
- [ ] Implement semantic markers detection
- [ ] Build update_feed generation
- [ ] Implement lifecycle management (active → cooling → closed)

### Phase 4: False Positive Recovery
- [ ] Build editorial notes system with CORRECTION_NOTE template
- [ ] Build manual rating system
- [ ] Implement auto-demotion for 6-hour stalls
- [ ] Test feedback loops

### Phase 5: Dashboard UI
- [ ] Three-section layout (Elevated, Developing, Monitoring)
- [ ] Live events separate view with real-time refresh
- [ ] Detail view with source list, timeline, credibility
- [ ] Archive search
- [ ] Manual correction interface

### Phase 6: Ad-hoc Topic Management
- [ ] Implement topic extraction pipeline
- [ ] Implement auto-promotion rules
- [ ] Create admin interface for promoting to formal topics
- [ ] Log feedback for system improvement

---

## TESTING STRATEGY

### Unit Tests
- [ ] Corroboration score calculation (test with known scenarios)
- [ ] Elevation scoring (confirm weightings apply correctly)
- [ ] Live event detection (test velocity spike threshold)
- [ ] GenAI prompts (test on diverse headlines)

### Integration Tests
- [ ] Article ingestion → clustering → dashboard appearance
- [ ] 6-hour stall detection
- [ ] False positive recovery workflow

### Manual Acceptance Tests
- [ ] Run dashboard against last 24 hours of real articles
- [ ] Verify Tier1 stories are actual geopolitical events
- [ ] Verify Tier2 stories are actual tech news
- [ ] Verify no false elevated stories
- [ ] Verify live events detect properly

---

## NOTES & GOTCHAS

1. **Timestamp handling**: Ensure all timestamps are UTC; handle timezone conversion when comparing update windows
2. **Source deduplication**: Same article may appear in multiple sources; deduplicate before counting
3. **Cache invalidation**: Dashboard scores should refresh every 5-10 minutes; cache aggressively but expire quickly
4. **GenAI cost**: Headline similarity + topic extraction = multiple GenAI calls; batch when possible
5. **Geographic filtering**: Primary geography boost should be multiplicative, not additive
6. **Negative topics**: Full topic exclusion vs. partial suppression (discuss with user)

---

## DEPLOYMENT

This layer should:
- Run as separate microservice from your ingestion/analysis layers
- Connect to shared article database
- Expose dashboard API for your frontend
- Implement scheduled jobs (every 5 min: clustering, live detection, lifecycle mgmt)
- Log all elevation/demotion decisions for audit trail

---

**END CURSOR PROMPT**

Copy above into Cursor IDE and begin with Phase 1.