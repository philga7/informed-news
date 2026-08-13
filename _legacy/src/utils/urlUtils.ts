/**
 * Extract clean domain from URL
 * Removes protocol, www prefix, and returns just the domain
 * 
 * @param url The URL to extract domain from
 * @returns Clean domain string (e.g., "example.com")
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;

    // Remove www. prefix if present
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }

    return hostname;
  } catch (error) {
    // If URL parsing fails, try to extract domain manually
    // Remove protocol
    let domain = url.replace(/^https?:\/\//, '');
    
    // Remove www. prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }

    // Remove path, query, and fragment
    domain = domain.split('/')[0].split('?')[0].split('#')[0];

    return domain || url;
  }
}

/**
 * Format source name with referenced domain for aggregator sources
 * For sources that scrape external URLs (like Citizen Free Press), 
 * appends the referenced domain to the source name
 * 
 * @param sourceName The name of the source (e.g., "Citizen Free Press")
 * @param recordUrl The resolved URL from the source record (external site URL for aggregators)
 * @param scrapeExternalUrl Whether the source scrapes external URLs
 * @returns Formatted string like "Citizen Free Press (reuters.com)" or just the source name
 */
export function formatSourceNameWithDomain(
  sourceName: string,
  recordUrl: string | null | undefined,
  scrapeExternalUrl: boolean
): string {
  if (!scrapeExternalUrl || !recordUrl) {
    return sourceName;
  }

  try {
    const domain = extractDomain(recordUrl);
    return `${sourceName} (${domain})`;
  } catch {
    // If domain extraction fails, return just the source name
    return sourceName;
  }
}

