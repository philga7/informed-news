import type { NewsArticle, Topic } from '../types';

// Common English stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
  'had', 'what', 'said', 'each', 'which', 'their', 'time', 'if',
  'up', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her',
  'would', 'make', 'like', 'into', 'him', 'has', 'two', 'more',
  'very', 'after', 'words', 'long', 'than', 'first', 'been', 'call',
  'who', 'oil', 'its', 'now', 'find', 'down', 'day', 'did', 'get',
  'come', 'made', 'may', 'part'
]);

// Extract meaningful keywords from text
function extractKeywords(text: string, minLength: number = 3): string[] {
  // Convert to lowercase and split by non-word characters
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= minLength && !STOP_WORDS.has(word));

  // Count word frequencies
  const wordCounts = new Map<string, number>();
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });

  // Extract phrases (2-3 word combinations)
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      phrases.push(bigram);
    }
  }

  // Combine single words and phrases, prioritize by frequency
  const keywords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  // Add top phrases
  const phraseCounts = new Map<string, number>();
  phrases.forEach(phrase => {
    phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
  });

  const topPhrases = Array.from(phraseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);

  return [...keywords, ...topPhrases];
}

// Calculate similarity between two strings using a simplified approach
// Optimized to avoid expensive substring operations
function similarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Word-based similarity (much faster than substring matching)
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const wordSim = union.size > 0 ? intersection.size / union.size : 0;

  // Simple substring check (only if shorter string is contained in longer)
  // Removed expensive nested loop substring search - word similarity is sufficient
  let substringSim = 0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.includes(shorter)) {
    substringSim = shorter.length / longer.length;
  }

  // Weighted combination - rely more on word similarity
  return wordSim * 0.85 + substringSim * 0.15;
}

// Calculate similarity between two articles based on title and keywords
function articleSimilarity(article1: NewsArticle, article2: NewsArticle): number {
  const titleSim = similarity(article1.title, article2.title);
  
  const keywords1 = extractKeywords(article1.title + ' ' + (article1.description || ''));
  const keywords2 = extractKeywords(article2.title + ' ' + (article2.description || ''));
  
  // Calculate keyword overlap
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  const keywordSim = union.size > 0 ? intersection.size / union.size : 0;

  // Weighted combination: title similarity is more important
  return titleSim * 0.7 + keywordSim * 0.3;
}

// Group articles by similarity - optimized with early exits and limits
function groupArticlesBySimilarity(articles: NewsArticle[], similarityThreshold: number = 0.5, excludeArticleIds: Set<string> = new Set()): NewsArticle[][] {
  const groups: NewsArticle[][] = [];
  const assigned = new Set<string>();
  
  // Limit processing to most recent articles to prevent performance issues
  // Process articles in reverse chronological order (newest first)
  const sortedArticles = [...articles].sort((a, b) => 
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  
  // Limit to 500 most recent articles for topic extraction initially
  // But exclude articles that are already in existing topics to find NEW groups
  // If we have excluded articles, expand the window to ensure we capture new articles
  // that might be outside the top 500 most recent
  const initialWindow = excludeArticleIds.size > 0 ? 1000 : 500;
  let articlesToProcess = sortedArticles
    .slice(0, initialWindow)
    .filter(article => !excludeArticleIds.has(article.id));
  
  // If we still have very few articles after exclusion, expand further
  if (articlesToProcess.length < 100 && excludeArticleIds.size > 0) {
    articlesToProcess = sortedArticles
      .filter(article => !excludeArticleIds.has(article.id))
      .slice(0, 500); // Take up to 500 unprocessed articles
  }
  let comparisons = 0;
  const maxComparisons = 50000; // Safety limit

  for (const article of articlesToProcess) {
    if (assigned.has(article.id)) continue;
    if (comparisons > maxComparisons) break; // Safety break

    const group: NewsArticle[] = [article];
    assigned.add(article.id);

    // Find similar articles - limit search to unassigned articles
    // If we have excluded articles, also check articles outside the 500 limit for better grouping
    for (const other of articlesToProcess) {
      if (assigned.has(other.id)) continue;
      if (comparisons > maxComparisons) break;
      
      comparisons++;
      const sim = articleSimilarity(article, other);
      if (sim >= similarityThreshold) {
        group.push(other);
        assigned.add(other.id);
      }
    }

    if (group.length > 0) {
      groups.push(group);
    }
  }

  return groups;
}

// Generate topic name from article group
// TODO: Future enhancement - replace with genAI to create more meaningful titles from associated topics
function generateTopicName(articles: NewsArticle[]): { name: string; keywords: string[] } {
  // Find the most common phrase or use top keywords
  const keywordCounts = new Map<string, number>();
  articles.forEach(article => {
    const articleKeywords = extractKeywords(article.title + ' ' + (article.description || ''));
    articleKeywords.forEach(kw => {
      keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
    });
  });

  const sortedKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([kw]) => kw);

  // Try to find a meaningful phrase (2-3 words) that appears in multiple articles
  const phrases: string[] = [];
  articles.forEach(article => {
    const words = article.title.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (words[i].length >= 3 && words[i + 1].length >= 3 && !STOP_WORDS.has(words[i])) {
        phrases.push(phrase);
      }
    }
  });

  const phraseCounts = new Map<string, number>();
  phrases.forEach(p => phraseCounts.set(p, (phraseCounts.get(p) || 0) + 1));

  const topPhrase = Array.from(phraseCounts.entries())
    .sort((a, b) => b[1] - a[1])[0];

  // Use top phrase if it appears in at least 2 articles, otherwise use top keywords
  const name = topPhrase && topPhrase[1] >= 2
    ? topPhrase[0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : sortedKeywords.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return { name, keywords: sortedKeywords.slice(0, 10) };
}

// Extract topics from articles with keyword deduplication across topics
export function extractTopics(articles: NewsArticle[], existingTopics: Topic[] = []): Topic[] {
  if (articles.length === 0) return [];

  // Collect article IDs that are already in existing topics
  const existingArticleIds = new Set(existingTopics.flatMap(topic => topic.articleIds));
  
  // Track keywords already assigned to topics (for deduplication)
  const usedKeywords = new Set<string>(
    existingTopics.flatMap(topic => topic.keywords.map(kw => kw.toLowerCase()))
  );
  
  // NEW APPROACH: Process ALL articles, but track which are new
  // This allows new articles to either:
  // 1. Group with other new articles (if similar) → new topic
  // 2. Group with articles that match existing topics → merge into existing topic
  // Don't exclude articles - let them group naturally, then decide merge vs new topic
  
  // Group ALL articles by similarity (no exclusion)
  const groups = groupArticlesBySimilarity(articles, 0.3, new Set()); // Process all articles
  
  // Filter out groups that are too small (less than 2 articles)
  const significantGroups = groups.filter(g => g.length >= 2);
  
  // Process groups and decide: merge into existing topic OR create new topic
  const topics: Topic[] = significantGroups.map((group) => {
    const { name, keywords } = generateTopicName(group);
    const articleIds = group.map(a => a.id);
    
    // Check if group contains new articles not already in existing topics
    const newArticlesInGroup = articleIds.filter(id => !existingArticleIds.has(id));

    // Find best matching existing topic by checking both article overlap and keyword similarity
    let bestMatch: { topic: Topic; score: number } | null = null;
    
    for (const existingTopic of existingTopics) {
      const sharedArticles = existingTopic.articleIds.filter(id => articleIds.includes(id));
      if (sharedArticles.length === 0) continue; // No article overlap, skip
      
      // Calculate keyword similarity
      const sharedKeywords = existingTopic.keywords.filter(kw => keywords.includes(kw));
      const keywordOverlap = sharedKeywords.length / Math.max(existingTopic.keywords.length, keywords.length);
      
      // Combined score: article overlap + keyword overlap
      const articleScore = sharedArticles.length / Math.max(existingTopic.articleIds.length, articleIds.length);
      const combinedScore = articleScore * 0.6 + keywordOverlap * 0.4;
      
      if (!bestMatch || combinedScore > bestMatch.score) {
        bestMatch = { topic: existingTopic, score: combinedScore };
      }
    }

    // Merge if we have a good match (shared articles AND decent similarity)
    if (bestMatch && bestMatch.score > 0.2) {
      // Merge with existing topic - add ALL articles (both old and new) and keywords
      const mergedArticleIds = [...new Set([...bestMatch.topic.articleIds, ...articleIds])];
      // Keep existing keywords and add new ones that aren't already used
      const newKeywords = keywords.filter(kw => !usedKeywords.has(kw.toLowerCase()));
      const mergedKeywords = [...bestMatch.topic.keywords, ...newKeywords].slice(0, 15);
      
      // Update used keywords set for this topic
      mergedKeywords.forEach(kw => usedKeywords.add(kw.toLowerCase()));
      
      return {
        ...bestMatch.topic,
        articleIds: mergedArticleIds,
        keywords: mergedKeywords,
        updatedAt: new Date(),
      };
    }
    
    // No good match - create new topic (only if group has NEW articles)
    if (newArticlesInGroup.length === 0) {
      // Group only contains articles already in topics, skip creating duplicate
      return null;
    }

    // Filter keywords to exclude those already used in other topics
    const deduplicatedKeywords = keywords.filter(kw => !usedKeywords.has(kw.toLowerCase()));
    
    // If all keywords were filtered out, use the original keywords anyway (better than empty)
    const finalKeywords = deduplicatedKeywords.length > 0 
      ? deduplicatedKeywords.slice(0, 10)
      : keywords.slice(0, 10);
    
    // Mark these keywords as used
    finalKeywords.forEach(kw => usedKeywords.add(kw.toLowerCase()));

    // Create new topic - includes both old and new articles in the group
    return {
      id: `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      keywords: finalKeywords,
      articleIds,
      followed: false,
      tags: [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }).filter((topic): topic is Topic => topic !== null); // Filter out null entries

  // Also preserve existing topics that weren't merged
  // (topics that had no new articles added to them)
  const mergedTopicIds = new Set(topics.map(t => t.id));
  const preservedTopics = existingTopics.filter(t => !mergedTopicIds.has(t.id));

  return [...topics, ...preservedTopics];
}

