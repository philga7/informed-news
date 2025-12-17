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

