/**
 * X.com Profile Timeline Embed Component
 * 
 * Component for embedding X.com profile timelines using Twitter's official widget.
 * Handles script loading and widget initialization.
 */

import { useEffect, useRef } from 'react';
import type { XcomProfile } from '../../types/xcom';
import {
  generateTimelineDataAttributes,
  generateProfileTimelineUrl,
  generateProfileTimelineText,
} from '../../utils/xcomEmbed';

interface XcomProfileTimelineEmbedProps {
  profile: XcomProfile;
}

/**
 * Check if Twitter widgets script is loaded
 */
function isTwitterWidgetsLoaded(): boolean {
  return typeof window !== 'undefined' && 'twttr' in window;
}

/**
 * Load Twitter widgets script dynamically if not already loaded
 */
function loadTwitterWidgetsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isTwitterWidgetsLoaded()) {
      resolve();
      return;
    }

    // Check if script is already in the process of loading
    const existingScript = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]');
    if (existingScript) {
      // Wait for script to load
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Twitter widgets script')));
      return;
    }

    // Script should already be in index.html, but if not, load it dynamically
    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.charset = 'utf-8';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Twitter widgets script'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Twitter widget for an anchor element
 */
async function initTwitterWidget(element: HTMLAnchorElement): Promise<void> {
  await loadTwitterWidgetsScript();

  if (isTwitterWidgetsLoaded() && (window as any).twttr?.widgets) {
    try {
      await (window as any).twttr.widgets.load(element);
    } catch (error) {
      console.error('Error initializing Twitter widget:', error);
    }
  }
}

export function XcomProfileTimelineEmbed({ profile }: XcomProfileTimelineEmbedProps) {
  const anchorRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    // Only render if profile is enabled
    if (!profile.enabled) {
      return;
    }

    // Initialize widget after component mounts
    const initWidget = async () => {
      try {
        await initTwitterWidget(anchor);
      } catch (error) {
        console.error('Error loading X.com profile timeline:', error);
      }
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(initWidget, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [profile.id, profile.username, profile.settings, profile.enabled]);

  // Don't render if profile is disabled
  if (!profile.enabled) {
    return (
      <div className="p-4 bg-stone-900 border border-stone-800 rounded-lg">
        <p className="text-stone-400 text-sm">This profile is disabled</p>
      </div>
    );
  }

  // Generate URL and text
  const timelineUrl = generateProfileTimelineUrl(profile.username);
  const timelineText = generateProfileTimelineText(profile.username);

  // Generate data attributes from settings
  const dataAttributes = generateTimelineDataAttributes(profile.settings);

  // Build attributes object
  const anchorAttributes: Record<string, string> = {
    className: 'twitter-timeline',
    href: timelineUrl,
    'data-theme': dataAttributes['data-theme'] || 'dark',
    ...dataAttributes,
  };

  // Remove undefined values
  Object.keys(anchorAttributes).forEach((key) => {
    if (anchorAttributes[key] === undefined) {
      delete anchorAttributes[key];
    }
  });

  return (
    <div className="w-full">
      <a
        ref={anchorRef}
        {...anchorAttributes}
      >
        {timelineText}
      </a>
    </div>
  );
}
