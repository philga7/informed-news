import { PRODUCT_NAME } from './brand';

export const RADAR_PAGE_TITLE = `Radar — ${PRODUCT_NAME}`;

export const RADAR_PAGE_DESCRIPTION = `${PRODUCT_NAME} radar shows a claim inbox and a secondary headline-cluster feed for operator triage. This view is session-gated and may be empty early on.`;

export const RADAR_LOGIN_INTRO =
	'Radar is currently limited to the MVP operator session. Enter the same password used for the local API to view the claim inbox.';

export const RADAR_CLAIMS_NEEDS_REVIEW_TITLE = 'Needs review';

export const RADAR_CLAIMS_SECTION_TITLE = 'Claims';

export const RADAR_CLAIMS_EMPTY_COPY =
	'No claims yet — run Refresh / fetch on the API to populate this inbox.';

export const RADAR_CLAIMS_LOAD_ERROR =
	'Unable to load the claim inbox right now. Try again in a moment.';

export const RADAR_CLAIMS_LINKED_HEADLINES_LABEL = 'Linked headlines';

export const RADAR_CLAIMS_SHOW_HEADLINES = 'Show';

export const RADAR_CLAIMS_HIDE_HEADLINES = 'Hide';

export const RADAR_CLAIMS_MARK_REVIEWED_LABEL = 'Mark reviewed';

export const RADAR_CLAIMS_MARK_ALL_REVIEWED_LABEL = 'Mark all reviewed';

export const RADAR_CLAIMS_MARK_REVIEWED_PENDING = 'Marking…';

export const RADAR_CLAIMS_MARK_ALL_REVIEWED_CONFIRM_TEMPLATE = 'Clear {count} from Needs review?';

export const RADAR_CLAIMS_MARK_REVIEWED_ERROR = 'Could not update Needs review. Try again.';

export const RADAR_HEADLINE_CLUSTERS_SECTION_TITLE = 'Headline clusters';

export const RADAR_EMPTY_COPY = 'No headline clusters yet — run Refresh / fetch on the API.';

export const RADAR_ERROR_GENERIC = 'Unable to load radar right now. Try again in a moment.';

export const RADAR_NETWORK_ERROR =
	'Network error while talking to the radar API. Check that the server is running on :3001.';

export const RADAR_META_HELP =
	'Radar pulls from Citizen Free Press and curated RSS at the time of the last fetch. Timestamps and errors below describe the ingest pipeline, not this UI.';

export const RADAR_ACCEPT_LABEL = 'Accept';

export const RADAR_UNACCEPT_LABEL = 'Unaccept';

export const RADAR_ACCEPT_PENDING = 'Saving…';

export const RADAR_ACCEPT_ERROR = 'Could not update Brief membership. Try again.';

export const RADAR_CLAIMS_ACCEPT_ERROR = 'Could not update claim membership. Try again.';

export const RADAR_TRACKED_SECTION_TITLE = 'Tracked';

export const RADAR_TRACKED_SECTION_HELP =
	'Developing stories you are watching for new members after ingest. Tracking does not Accept a cluster onto the Brief.';

export const RADAR_TRACKED_UPDATE_BADGE = 'Update';

export const RADAR_TRACKED_DISMISS_LABEL = 'Dismiss';

export const RADAR_TRACKED_DISMISS_PENDING = 'Dismissing…';

export const RADAR_TRACKED_ACK_ERROR = 'Could not clear tracked update. Try again.';

export const RADAR_CLAIMS_TRACKED_SECTION_TITLE = 'Tracked claims';

export const RADAR_CLAIMS_TRACKED_SECTION_HELP =
	'Claims you are watching for new evidence or stance changes. Tracking does not Accept a claim onto the Brief.';

export const RADAR_CLAIMS_TRACKED_ACK_ERROR = 'Could not clear tracked claim update. Try again.';

export const RADAR_TRACK_LABEL = 'Track';

export const RADAR_UNTRACK_LABEL = 'Untrack';

export const RADAR_TRACK_PENDING = 'Saving…';

export const RADAR_TRACK_ERROR = 'Could not update tracked stories. Try again.';

export const RADAR_CLAIMS_TRACK_ERROR = 'Could not update tracked claims. Try again.';

export const RADAR_HIDDEN_MUTED_PREFIX = 'Hidden';

export const RADAR_MUTED_LABEL = 'Muted';

export const RADAR_MUTES_SECTION_TITLE = 'Mute rules';

export const RADAR_MUTES_SECTION_HELP =
	'Hide clusters from Radar and veto Brief membership using keyword + optional source matches.';

export const RADAR_MUTES_KEYWORD_LABEL = 'Keyword';

export const RADAR_MUTES_SOURCE_LABEL = 'Source (optional)';

export const RADAR_MUTES_ADD_LABEL = 'Mute';

export const RADAR_MUTES_DELETE_LABEL = 'Delete';

export const RADAR_MUTES_EMPTY_COPY = 'No mute rules yet.';

export const RADAR_MUTES_LOAD_ERROR = 'Could not load mute rules. Try again.';

export const RADAR_MUTES_SAVE_ERROR = 'Could not save mute rule. Try again.';

export const RADAR_MUTES_DELETE_ERROR = 'Could not delete mute rule. Try again.';
