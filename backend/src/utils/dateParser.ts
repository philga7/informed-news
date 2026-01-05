/**
 * Date Parser Utility
 * 
 * Parses various date formats from Nitter HTML pages:
 * - Relative times: "2s", "25m", "1h", "10h"
 * - Absolute dates: "Jan 5, 2026 · 3:01 AM UTC"
 * - Date-only: "Jan 4"
 */

/**
 * Parse Nitter date string into a Date object
 * @param dateString Date string from Nitter HTML
 * @returns Date object or null if parsing fails
 */
export function parseNitterDate(dateString: string): Date | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();

  // Try parsing absolute date format: "Jan 5, 2026 · 3:01 AM UTC"
  if (trimmed.includes('·') && trimmed.includes('UTC')) {
    try {
      // Extract date and time parts
      const parts = trimmed.split('·');
      if (parts.length === 2) {
        const datePart = parts[0].trim();
        const timePart = parts[1].trim().replace('UTC', '').trim();
        
        // Parse date and time
        const dateTimeString = `${datePart} ${timePart} UTC`;
        const parsed = new Date(dateTimeString);
        
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    } catch (error) {
      // Fall through to other parsing methods
    }
  }

  // Try parsing date-only format: "Jan 4" or "Jan 4, 2026"
  if (/^[A-Za-z]{3}\s+\d{1,2}(,\s+\d{4})?$/.test(trimmed)) {
    try {
      // If no year, assume current year
      let dateStr = trimmed;
      if (!trimmed.includes(',')) {
        const currentYear = new Date().getFullYear();
        dateStr = `${trimmed}, ${currentYear}`;
      }
      
      // Add default time (start of day)
      const parsed = new Date(`${dateStr} 00:00:00 UTC`);
      
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (error) {
      // Fall through to relative time parsing
    }
  }

  // Parse relative time: "2s", "25m", "1h", "10h"
  const relativeMatch = trimmed.match(/^(\d+)([smhd])$/);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    
    const now = new Date();
    let milliseconds = 0;
    
    switch (unit) {
      case 's': // seconds
        milliseconds = value * 1000;
        break;
      case 'm': // minutes
        milliseconds = value * 60 * 1000;
        break;
      case 'h': // hours
        milliseconds = value * 60 * 60 * 1000;
        break;
      case 'd': // days
        milliseconds = value * 24 * 60 * 60 * 1000;
        break;
      default:
        return null;
    }
    
    return new Date(now.getTime() - milliseconds);
  }

  // Try parsing as ISO date string
  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch (error) {
    // Ignore
  }

  // If all parsing fails, return null
  return null;
}

