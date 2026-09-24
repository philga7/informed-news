import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to mvp/data (sibling of mvp/server) */
export const DATA_DIR = path.resolve(__dirname, '../../../data');

export const ARTICLES_PATH = path.join(DATA_DIR, 'articles.json');
export const META_PATH = path.join(DATA_DIR, 'meta.json');
export const CLUSTER_ENRICHMENTS_PATH = path.join(
  DATA_DIR,
  'cluster-enrichments.json',
);
export const BRIEF_MEMBERSHIP_PATH = path.join(DATA_DIR, 'brief-membership.json');
export const TRACKED_STORIES_PATH = path.join(DATA_DIR, 'tracked-stories.json');
export const MUTE_RULES_PATH = path.join(DATA_DIR, 'mute-rules.json');

export const CLAIMS_PATH = path.join(DATA_DIR, 'claims.json');
export const EVIDENCE_LINKS_PATH = path.join(DATA_DIR, 'evidence-links.json');

export const CLAIM_MEMBERSHIP_PATH = path.join(DATA_DIR, 'claim-membership.json');
export const TRACKED_CLAIMS_PATH = path.join(DATA_DIR, 'tracked-claims.json');
export const CLAIM_REVIEW_QUEUE_PATH = path.join(DATA_DIR, 'claim-review-queue.json');
export const CLAIM_EXTRACT_PROCESSED_PATH = path.join(
  DATA_DIR,
  'claim-extract-processed.json',
);
