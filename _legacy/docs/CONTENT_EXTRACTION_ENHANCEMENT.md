# Content Extraction Enhancement

## Problem

RSS feeds often only provide short summaries (descriptions) rather than full article content. When AI analysis tries to summarize or analyze these records, it only has access to the title and brief snippet, leading to unhelpful results like:

> "The provided text references an article about optimizing a computer's memory subsystem, but the article content is missing. The only information given is a link to an external discussion forum."

## Solution

We've enhanced the ingestion system to **automatically extract full article content** from web pages using Mozilla's Readability library.

### What Changed

1. **New ContentExtractor Service** (`backend/src/services/ingestion/ContentExtractor.ts`)
   - Uses `@mozilla/readability` to extract clean article text from HTML
   - Removes ads, navigation, footers, and other non-content elements
   - Returns just the main article body text

2. **Enhanced RSS Ingestion** (`backend/src/services/ingestion/RssIngestionService.ts`)
   - New `extractFullContent` configuration option
   - If RSS feed content is < 500 characters, automatically fetches full article from URL
   - Falls back to RSS content if extraction fails
   - Logs extraction success/failure for monitoring

3. **Updated Routes** (ingest.ts, IngestionScheduler.ts)
   - Content extraction enabled by default for all RSS ingestion
   - Both manual and scheduled ingestion benefit from this enhancement

## How It Works

```
1. Fetch RSS feed
2. For each item:
   a. Check if RSS content < 500 chars
   b. If yes: Fetch HTML from article URL
   c. Extract main article text using Readability
   d. Use extracted text if longer than RSS content
   e. Store in database
3. AI analysis now has full article text!
```

## Benefits

- **Better AI Summaries**: AI can now summarize the actual article, not just the snippet
- **More Accurate Entity Extraction**: Full text contains all people, organizations, locations mentioned
- **Better Tone Analysis**: Can assess bias and sentiment across the entire article
- **Automatic**: No configuration needed, works out of the box

## Example: Before vs. After

### Before (RSS snippet only)
```
Title: "Memory Subsystem Optimizations"
Content: "In this blog I wrote 18 blog posts about memory subsystem optimizations..."
→ AI Summary: "Cannot summarize, content missing"
```

### After (full article extracted)
```
Title: "Memory Subsystem Optimizations"
Content: [Full 5000+ word article about cache optimization, memory layout, etc.]
→ AI Summary: "Comprehensive guide covering 15 topics including decreasing memory accesses, 
   data access patterns, class layouts, TLB cache optimization, and multithreading..."
```

## Configuration

Content extraction is **enabled by default** for all RSS sources. To disable it:

```typescript
const rssService = new RssIngestionService({
  sourceId: source.id,
  feedUrl: source.url,
  extractFullContent: false, // Disable content extraction
});
```

## Monitoring

When ingestion runs, look for these log messages:

```
📄 Extracting full content for: Memory Subsystem Optimizations
✅ Extracted 45123 chars from https://example.com/article
```

Or if extraction fails:
```
⚠️  Content extraction failed or yielded less content for https://example.com/article
```

## Performance Considerations

- **Additional HTTP Requests**: Each article requires an extra HTTP request to fetch HTML
- **Processing Time**: Readability parsing adds ~100-500ms per article
- **Network Dependency**: If source website is slow/down, extraction may fail
- **Fallback**: Always falls back to RSS content if extraction fails

### Recommendations

- Content extraction happens during ingestion (background process)
- Not a blocking operation for end users
- Timeout set to 15 seconds per URL
- Failed extractions don't break ingestion

## Testing

### Test Full Article Extraction

1. Trigger ingestion for a source:
```bash
curl -X POST http://localhost:3001/api/ingest/source/{source-id}
```

2. Check logs for extraction messages
3. View source record in database - `content` field should have full article text
4. Run AI analysis - should now generate meaningful summaries

### Test with Your RSS Feed

```bash
curl -X POST http://localhost:3001/api/ingest/rss \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "your-org-id",
    "source_id": "your-source-id"
  }'
```

Watch backend logs for extraction activity.

## Dependencies Added

```json
{
  "@mozilla/readability": "^0.5.0",
  "jsdom": "^24.0.0"
}
```

## Future Enhancements

Potential improvements:

1. **Configurable per Source**: Add `extract_full_content` field to `sources` table
2. **Content Caching**: Cache extracted content to avoid re-fetching
3. **Better Error Handling**: Retry failed extractions with exponential backoff
4. **Alternative Extractors**: Support Mercury Parser, Diffbot, or custom extractors
5. **Image Extraction**: Extract and store article images
6. **PDF Support**: Extract content from PDF articles
7. **Paywall Detection**: Detect paywalled content and mark appropriately

## Troubleshooting

### "Content extraction failed"

**Causes:**
- Website blocks bots (403 Forbidden)
- Website requires JavaScript to render content
- Network timeout (slow website)
- Invalid/malformed HTML

**Solutions:**
- Use the RSS content (automatic fallback)
- For JS-heavy sites, would need Puppeteer (future enhancement)
- Increase timeout in ContentExtractor.ts

### Extracted content is garbage

**Causes:**
- Readability couldn't identify main content
- Page has unusual structure

**Solutions:**
- Report issue with URL
- May need custom extraction rules for specific sites

### Performance Issues

If ingestion is too slow:

1. Check network latency to source websites
2. Consider disabling extraction for high-volume sources
3. Implement parallel extraction with concurrency limits
4. Add caching layer

## Related Documentation

- [PLAN_6_OLLAMA_INTEGRATION_COMPLETE.md](./PLAN_6_OLLAMA_INTEGRATION_COMPLETE.md) - AI analysis features
- [TESTING_PLAN_6_OLLAMA.md](./TESTING_PLAN_6_OLLAMA.md) - Testing AI analysis

## Summary

The content extraction enhancement ensures that AI analysis has access to **full article content** rather than just RSS snippets, dramatically improving the quality of AI-generated summaries, entity extraction, and tone analysis.

**Status**: ✅ Implemented and enabled by default

