import { PRODUCT_NAME } from './brand';

export const RADAR_PAGE_TITLE = `Radar — ${PRODUCT_NAME}`;

export const RADAR_PAGE_DESCRIPTION =
	`${PRODUCT_NAME} radar shows clustered headlines from Citizen Free Press and curated RSS sources for operator triage. This view is session-gated and may be empty early on.`;

export const RADAR_LOGIN_INTRO =
	'Radar is currently limited to the MVP operator session. Enter the same password used for the local API to view clustered headlines.';

export const RADAR_EMPTY_COPY =
	'No radar items yet — run Refresh / fetch on the API.';

export const RADAR_ERROR_GENERIC =
	'Unable to load radar right now. Try again in a moment.';

export const RADAR_NETWORK_ERROR =
	'Network error while talking to the radar API. Check that the server is running on :3001.';

export const RADAR_META_HELP =
	'Radar pulls from Citizen Free Press and curated RSS at the time of the last fetch. Timestamps and errors below describe the ingest pipeline, not this UI.';

export const RADAR_ACCEPT_LABEL = 'Accept';

export const RADAR_UNACCEPT_LABEL = 'Unaccept';

export const RADAR_ACCEPT_PENDING = 'Saving…';

export const RADAR_ACCEPT_ERROR =
	'Could not update Brief membership. Try again.';

