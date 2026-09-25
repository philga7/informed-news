<script lang="ts">
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { PRODUCT_NAME } from '$lib/brand';
import {
	RADAR_ACCEPT_ERROR,
	RADAR_ACCEPT_LABEL,
	RADAR_ACCEPT_PENDING,
	RADAR_CLAIMS_ACCEPT_ERROR,
	RADAR_CLAIMS_EMPTY_COPY,
	RADAR_CLAIMS_HIDE_HEADLINES,
	RADAR_CLAIMS_LINKED_HEADLINES_LABEL,
	RADAR_CLAIMS_LOAD_ERROR,
	RADAR_CLAIMS_MARK_ALL_REVIEWED_CONFIRM_TEMPLATE,
	RADAR_CLAIMS_MARK_ALL_REVIEWED_LABEL,
	RADAR_CLAIMS_MARK_REVIEWED_ERROR,
	RADAR_CLAIMS_MARK_REVIEWED_LABEL,
	RADAR_CLAIMS_MARK_REVIEWED_PENDING,
	RADAR_CLAIMS_NEEDS_REVIEW_TITLE,
	RADAR_CLAIMS_SECTION_TITLE,
	RADAR_CLAIMS_SHOW_HEADLINES,
	RADAR_CLAIMS_TRACK_ERROR,
	RADAR_CLAIMS_TRACKED_ACK_ERROR,
	RADAR_CLAIMS_TRACKED_SECTION_HELP,
	RADAR_CLAIMS_TRACKED_SECTION_TITLE,
	RADAR_EMPTY_COPY,
	RADAR_ERROR_GENERIC,
	RADAR_HEADLINE_CLUSTERS_SECTION_TITLE,
	RADAR_HIDDEN_MUTED_PREFIX,
	RADAR_LOGIN_INTRO,
	RADAR_META_HELP,
	RADAR_MUTED_LABEL,
	RADAR_MUTES_ADD_LABEL,
	RADAR_MUTES_DELETE_ERROR,
	RADAR_MUTES_DELETE_LABEL,
	RADAR_MUTES_EMPTY_COPY,
	RADAR_MUTES_KEYWORD_LABEL,
	RADAR_MUTES_LOAD_ERROR,
	RADAR_MUTES_SAVE_ERROR,
	RADAR_MUTES_SECTION_HELP,
	RADAR_MUTES_SECTION_TITLE,
	RADAR_MUTES_SOURCE_LABEL,
	RADAR_NETWORK_ERROR,
	RADAR_PAGE_DESCRIPTION,
	RADAR_PAGE_TITLE,
	RADAR_TRACK_ERROR,
	RADAR_TRACK_LABEL,
	RADAR_TRACK_PENDING,
	RADAR_TRACKED_ACK_ERROR,
	RADAR_TRACKED_DISMISS_LABEL,
	RADAR_TRACKED_DISMISS_PENDING,
	RADAR_TRACKED_SECTION_HELP,
	RADAR_TRACKED_SECTION_TITLE,
	RADAR_TRACKED_UPDATE_BADGE,
	RADAR_UNACCEPT_LABEL,
	RADAR_UNTRACK_LABEL,
} from '$lib/radar';

type ClaimRadarLinkedHeadline = {
	id: string;
	title: string;
	sourceKind: string;
	publisherDomain: string | null;
	publishedAt: string | null;
	canonicalUrl: string;
	sourceTier: 'primary' | 'sensor';
	stance: 'supports' | 'contradicts' | 'mentions';
};

type ClaimRadarEvidenceCounts = {
	total: number;
	supports: number;
	contradicts: number;
	mentions: number;
	primary: number;
	sensor: number;
};

type ClaimRadarItem = {
	claimId: string;
	text: string;
	claimType: string;
	status: string;
	createdAt: string;
	confidence: number | null;
	evidence: ClaimRadarEvidenceCounts;
	clusterKeys: string[];
	linkedHeadlines: ClaimRadarLinkedHeadline[];
	needsReview: boolean;
	reviewReasons: string[];
	accepted: boolean;
	tracked: boolean;
	pendingUpdate: boolean;
};

type ClaimsRadarResponse =
	| {
			ok: true;
			claims: ClaimRadarItem[];
			needsReview: ClaimRadarItem[];
			hiddenMutedCount: number;
	  }
	| {
			ok: false;
			error: string;
	  };

type RadarHeadline = {
	id: string;
	title: string;
	sourceKind: 'cfp' | 'rss';
	publisherDomain: string | null;
	publishedAt: string | null;
	canonicalUrl: string;
	citationLabel: string | null;
};

type RadarCluster = {
	clusterId: string;
	headlines: RadarHeadline[];
	newestAt: string | null;
	accepted: boolean;
	tracked: boolean;
	pendingUpdate?: boolean;
};

type MuteRule = {
	id: string;
	keyword: string;
	source: string | null;
	createdAt: string;
};

type RadarMeta = {
	lastFetchAt: string | null;
	lastError: string | null;
};

type TrackedEntry = {
	clusterId: string;
	trackedAt: string;
	memberCountSnapshot: number;
	pendingUpdate: boolean;
	muted?: boolean;
};

type TrackedClaimEntry = {
	claimId: string;
	trackedAt: string;
	pendingUpdate: boolean;
};

type RadarResponse =
	| {
			ok: true;
			clusters: RadarCluster[];
			hiddenMutedCount: number;
			meta: RadarMeta;
	  }
	| {
			ok: false;
			error: string;
	  };

type MutesResponse =
	| {
			ok: true;
			rules: MuteRule[];
			updatedAt: string | null;
	  }
	| {
			ok: false;
			error: string;
	  };

type TrackedResponse =
	| {
			ok: true;
			entries: TrackedEntry[];
			updatedAt: string | null;
	  }
	| {
			ok: false;
			error: string;
	  };

type TrackedClaimsResponse =
	| {
			ok: true;
			entries: TrackedClaimEntry[];
			updatedAt: string | null;
	  }
	| {
			ok: false;
			error: string;
	  };

let loading = true;
let unauthenticated = false;
let needsReviewClaims: ClaimRadarItem[] = [];
let claims: ClaimRadarItem[] = [];
let clusters: RadarCluster[] = [];
let trackedEntries: TrackedEntry[] = [];
let trackedClaimEntries: TrackedClaimEntry[] = [];
let hiddenMutedCount = 0;
let meta: RadarMeta | null = null;
let claimsError: string | null = null;
let clustersError: string | null = null;

let password = '';
let loginError: string | null = null;
let loggingIn = false;
let pendingClusterId: string | null = null;
let pendingTrackClusterId: string | null = null;
let pendingAckClusterId: string | null = null;
let pendingClaimId: string | null = null;
let pendingTrackClaimId: string | null = null;
let pendingAckClaimId: string | null = null;
let pendingReviewedClaimId: string | null = null;
let pendingReviewAll = false;
let acceptError: string | null = null;
let trackError: string | null = null;
let ackError: string | null = null;
let claimAcceptError: string | null = null;
let claimTrackError: string | null = null;
let claimAckError: string | null = null;
let claimReviewError: string | null = null;

let muteRules: MuteRule[] = [];
let muteLoadError: string | null = null;
let pendingMute = false;
let pendingDeleteMuteId: string | null = null;
let muteActionError: string | null = null;
let keyword = '';
let source = '';

let expandedClaimIds = new Set<string>();

function trackedClusterRows(): Array<
	| { kind: 'resolved'; entry: TrackedEntry; cluster: RadarCluster }
	| { kind: 'stub'; entry: TrackedEntry }
> {
	const byClusterId = new Map(clusters.map((c) => [c.clusterId, c]));
	const entries = [...trackedEntries].sort((a, b) => b.trackedAt.localeCompare(a.trackedAt));
	return entries.map((entry) => {
		const resolved = byClusterId.get(entry.clusterId);
		if (resolved) return { kind: 'resolved', entry, cluster: resolved };
		return { kind: 'stub', entry };
	});
}

function trackedClaimRows(): Array<
	| { kind: 'resolved'; entry: TrackedClaimEntry; claim: ClaimRadarItem }
	| { kind: 'stub'; entry: TrackedClaimEntry }
> {
	const byClaimId = new Map<string, ClaimRadarItem>(
		[...needsReviewClaims, ...claims].map((c) => [c.claimId, c]),
	);
	const entries = [...trackedClaimEntries].sort((a, b) => b.trackedAt.localeCompare(a.trackedAt));
	return entries.map((entry) => {
		const resolved = byClaimId.get(entry.claimId);
		if (resolved) return { kind: 'resolved', entry, claim: resolved };
		return { kind: 'stub', entry };
	});
}

function updateClaim(claimId: string, updater: (claim: ClaimRadarItem) => ClaimRadarItem): void {
	needsReviewClaims = needsReviewClaims.map((claim) =>
		claim.claimId === claimId ? updater(claim) : claim,
	);
	claims = claims.map((claim) => (claim.claimId === claimId ? updater(claim) : claim));
}

function formatDateTime(value: string | null): string {
	if (!value) return 'not yet run';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	});
}

function humanizeLabel(value: string): string {
	if (!value) return '';
	return value
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatConfidence(value: number | null): string {
	if (value === null || value === undefined) return '—';
	if (!Number.isFinite(value)) return '—';
	const percent = Math.round(value * 100);
	return `${percent}%`;
}

function toggleClaimExpanded(claimId: string): void {
	const next = new Set(expandedClaimIds);
	if (next.has(claimId)) next.delete(claimId);
	else next.add(claimId);
	expandedClaimIds = next;
}

function markAllReviewedConfirm(count: number): string {
	return RADAR_CLAIMS_MARK_ALL_REVIEWED_CONFIRM_TEMPLATE.replace('{count}', String(count));
}

async function loadRadar(initial = false): Promise<void> {
	if (initial) {
		unauthenticated = false;
	}
	loading = true;
	claimsError = null;
	clustersError = null;
	acceptError = null;
	trackError = null;
	ackError = null;
	claimAcceptError = null;
	claimTrackError = null;
	claimAckError = null;
	claimReviewError = null;
	muteLoadError = null;
	muteActionError = null;

	try {
		const [claimsResponse, radarResponse, trackedResponse, trackedClaimsResponse, mutesResponse] =
			await Promise.all([
				fetch('/api/claims/radar', { credentials: 'include' }),
				fetch('/api/radar', { credentials: 'include' }),
				fetch('/api/brief/tracked', { credentials: 'include' }),
				fetch('/api/claims/tracked', { credentials: 'include' }),
				fetch('/api/brief/mutes', { credentials: 'include' }),
			]);

		if (
			claimsResponse.status === 401 ||
			radarResponse.status === 401 ||
			trackedResponse.status === 401 ||
			trackedClaimsResponse.status === 401 ||
			mutesResponse.status === 401
		) {
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		let claimsHiddenMutedCount = 0;
		if (!claimsResponse.ok) {
			const body = (await claimsResponse.json().catch(() => null)) as ClaimsRadarResponse | null;
			claimsError = (body && !body.ok && body.error) || RADAR_CLAIMS_LOAD_ERROR;
			needsReviewClaims = [];
			claims = [];
		} else {
			const body = (await claimsResponse.json().catch(() => null)) as ClaimsRadarResponse | null;
			if (body && body.ok) {
				needsReviewClaims = body.needsReview;
				claims = body.claims;
				claimsHiddenMutedCount =
					typeof body.hiddenMutedCount === 'number' ? body.hiddenMutedCount : 0;
			} else {
				claimsError = (body && !body.ok && body.error) || RADAR_CLAIMS_LOAD_ERROR;
				needsReviewClaims = [];
				claims = [];
			}
		}

		let clustersHiddenMutedCount = 0;
		if (!radarResponse.ok) {
			const body = (await radarResponse.json().catch(() => null)) as RadarResponse | null;
			clustersError = (body && !body.ok && body.error) || RADAR_ERROR_GENERIC;
			clusters = [];
			meta = null;
		} else {
			const body = (await radarResponse.json().catch(() => null)) as RadarResponse | null;
			if (body && body.ok) {
				clusters = body.clusters;
				clustersHiddenMutedCount =
					typeof body.hiddenMutedCount === 'number' ? body.hiddenMutedCount : 0;
				meta = body.meta;
			} else {
				clustersError = (body && !body.ok && body.error) || RADAR_ERROR_GENERIC;
				clusters = [];
				meta = null;
			}
		}

		hiddenMutedCount = Math.max(claimsHiddenMutedCount, clustersHiddenMutedCount);

		if (!mutesResponse.ok) {
			muteRules = [];
			const mutes = (await mutesResponse.json().catch(() => null)) as MutesResponse | null;
			muteLoadError = (mutes && !mutes.ok && mutes.error) || RADAR_MUTES_LOAD_ERROR;
		} else {
			const mutes = (await mutesResponse.json().catch(() => null)) as MutesResponse | null;
			if (mutes && mutes.ok) {
				muteRules = mutes.rules;
			} else {
				muteRules = [];
				muteLoadError = (mutes && !mutes.ok && mutes.error) || RADAR_MUTES_LOAD_ERROR;
			}
		}

		// Do not leave a stale tracked list mounted after transient failures.
		// Any tracked-endpoint failure (non-401) clears trackedEntries rather than keeping
		// the last successful list as if it were current.
		if (!trackedResponse.ok) {
			trackedEntries = [];
			const tracked = (await trackedResponse.json().catch(() => null)) as TrackedResponse | null;
			trackError = (tracked && !tracked.ok && tracked.error) || RADAR_TRACK_ERROR;
		} else {
			const tracked = (await trackedResponse.json().catch(() => null)) as TrackedResponse | null;
			if (tracked && tracked.ok) {
				trackedEntries = tracked.entries;
			} else {
				trackedEntries = [];
				trackError = (tracked && !tracked.ok && tracked.error) || RADAR_TRACK_ERROR;
			}
		}

		if (!trackedClaimsResponse.ok) {
			trackedClaimEntries = [];
			const tracked = (await trackedClaimsResponse
				.json()
				.catch(() => null)) as TrackedClaimsResponse | null;
			claimTrackError = (tracked && !tracked.ok && tracked.error) || RADAR_CLAIMS_TRACK_ERROR;
		} else {
			const tracked = (await trackedClaimsResponse
				.json()
				.catch(() => null)) as TrackedClaimsResponse | null;
			if (tracked && tracked.ok) {
				trackedClaimEntries = tracked.entries;
			} else {
				trackedClaimEntries = [];
				claimTrackError = (tracked && !tracked.ok && tracked.error) || RADAR_CLAIMS_TRACK_ERROR;
			}
		}
	} catch (err) {
		console.error('Error loading radar', err);
		claimsError = RADAR_NETWORK_ERROR;
		clustersError = RADAR_NETWORK_ERROR;
	} finally {
		loading = false;
	}
}

async function ackTrackedUpdate(clusterId: string): Promise<boolean> {
	if (pendingAckClusterId || loading) return false;

	pendingAckClusterId = clusterId;
	ackError = null;

	try {
		const response = await fetch('/api/brief/tracked/ack', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ clusterId }),
		});

		if (response.status === 401) {
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return false;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
			entries?: TrackedEntry[];
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			ackError = (body && body.error) || RADAR_TRACKED_ACK_ERROR;
			return false;
		}

		if (body && Array.isArray(body.entries)) {
			trackedEntries = body.entries;
		} else {
			await loadRadar();
		}

		return true;
	} catch (err) {
		console.error('Error acknowledging tracked update', err);
		ackError = RADAR_NETWORK_ERROR;
		return false;
	} finally {
		pendingAckClusterId = null;
	}
}

async function openOnBrief(clusterId: string, pendingUpdate: boolean): Promise<void> {
	if (pendingUpdate) {
		const ok = await ackTrackedUpdate(clusterId);
		if (!ok) return;
	}
	await goto('/');
}

async function addMuteRule(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (pendingMute || loading) return;

	const nextKeyword = keyword.trim();
	const nextSource = source.trim();
	if (!nextKeyword) {
		muteActionError = 'Keyword is required.';
		return;
	}

	muteActionError = null;
	pendingMute = true;

	try {
		const response = await fetch('/api/brief/mutes', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				keyword: nextKeyword,
				...(nextSource ? { source: nextSource } : {}),
			}),
		});

		if (response.status === 401) {
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
			rules?: MuteRule[];
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			muteActionError = (body && body.error) || RADAR_MUTES_SAVE_ERROR;
			return;
		}

		keyword = '';
		source = '';
		await loadRadar();
	} catch (err) {
		console.error('Error creating mute rule', err);
		muteActionError = RADAR_NETWORK_ERROR;
	} finally {
		pendingMute = false;
	}
}

async function deleteMuteRule(id: string): Promise<void> {
	if (pendingDeleteMuteId || loading) return;
	pendingDeleteMuteId = id;
	muteActionError = null;

	try {
		const response = await fetch(`/api/brief/mutes/${encodeURIComponent(id)}`, {
			method: 'DELETE',
			credentials: 'include',
		});

		if (response.status === 401) {
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
			rules?: MuteRule[];
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			muteActionError = (body && body.error) || RADAR_MUTES_DELETE_ERROR;
			return;
		}

		await loadRadar();
	} catch (err) {
		console.error('Error deleting mute rule', err);
		muteActionError = RADAR_NETWORK_ERROR;
	} finally {
		pendingDeleteMuteId = null;
	}
}

async function handleLogin(event: SubmitEvent): Promise<void> {
	event.preventDefault();

	if (!password || loggingIn) return;

	loginError = null;
	loggingIn = true;

	try {
		const response = await fetch('/api/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'include',
			body: JSON.stringify({ password }),
		});

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			loginError = (body && body.error) || 'Login failed. Check the password and try again.';
			return;
		}

		password = '';
		unauthenticated = false;
		await loadRadar();
	} catch (err) {
		console.error('Error during radar login', err);
		loginError = RADAR_NETWORK_ERROR;
	} finally {
		loggingIn = false;
	}
}

async function handleLogout(): Promise<void> {
	try {
		await fetch('/api/logout', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'include',
		});
	} catch (err) {
		console.error('Error during radar logout', err);
	} finally {
		needsReviewClaims = [];
		claims = [];
		clusters = [];
		trackedEntries = [];
		trackedClaimEntries = [];
		muteRules = [];
		hiddenMutedCount = 0;
		meta = null;
		claimsError = null;
		clustersError = null;
		acceptError = null;
		trackError = null;
		ackError = null;
		claimAcceptError = null;
		claimTrackError = null;
		claimAckError = null;
		claimReviewError = null;
		muteLoadError = null;
		muteActionError = null;
		pendingClusterId = null;
		pendingTrackClusterId = null;
		pendingAckClusterId = null;
		pendingClaimId = null;
		pendingTrackClaimId = null;
		pendingAckClaimId = null;
		pendingReviewedClaimId = null;
		pendingReviewAll = false;
		unauthenticated = true;
	}
}

function setClusterAccepted(clusterId: string, accepted: boolean): void {
	clusters = clusters.map((cluster) =>
		cluster.clusterId === clusterId ? { ...cluster, accepted } : cluster,
	);
}

function setClusterTracked(clusterId: string, tracked: boolean): void {
	clusters = clusters.map((cluster) =>
		cluster.clusterId === clusterId ? { ...cluster, tracked } : cluster,
	);
}

async function toggleAccept(cluster: RadarCluster): Promise<void> {
	if (pendingClusterId || loading) return;

	const nextAccepted = !cluster.accepted;
	const previousAccepted = cluster.accepted;
	acceptError = null;
	pendingClusterId = cluster.clusterId;
	setClusterAccepted(cluster.clusterId, nextAccepted);

	try {
		const response = await fetch(nextAccepted ? '/api/brief/accept' : '/api/brief/unaccept', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'include',
			body: JSON.stringify({ clusterId: cluster.clusterId }),
		});

		if (response.status === 401) {
			setClusterAccepted(cluster.clusterId, previousAccepted);
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			setClusterAccepted(cluster.clusterId, previousAccepted);
			acceptError = (body && body.error) || RADAR_ACCEPT_ERROR;
			return;
		}

		if (nextAccepted) {
			// Accept defaults to track on the server (NEWS-59).
			setClusterTracked(cluster.clusterId, true);
			if (!trackedEntries.some((entry) => entry.clusterId === cluster.clusterId)) {
				await loadRadar();
			}
		}
	} catch (err) {
		console.error('Error toggling Brief membership', err);
		setClusterAccepted(cluster.clusterId, previousAccepted);
		acceptError = RADAR_NETWORK_ERROR;
	} finally {
		pendingClusterId = null;
	}
}

async function toggleTrack(clusterId: string, currentlyTracked: boolean): Promise<void> {
	if (pendingTrackClusterId || loading) return;
	const previousTracked = currentlyTracked;
	const nextTracked = !currentlyTracked;
	trackError = null;
	pendingTrackClusterId = clusterId;
	setClusterTracked(clusterId, nextTracked);

	try {
		const response = await fetch(nextTracked ? '/api/brief/track' : '/api/brief/untrack', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ clusterId }),
		});

		if (response.status === 401) {
			setClusterTracked(clusterId, previousTracked);
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
			entries?: TrackedEntry[];
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			setClusterTracked(clusterId, previousTracked);
			trackError = (body && body.error) || RADAR_TRACK_ERROR;
			return;
		}

		if (body && Array.isArray(body.entries)) {
			trackedEntries = body.entries;
		} else {
			await loadRadar();
		}
	} catch (err) {
		console.error('Error toggling tracked stories', err);
		setClusterTracked(clusterId, previousTracked);
		trackError = RADAR_NETWORK_ERROR;
	} finally {
		pendingTrackClusterId = null;
	}
}

async function ackTrackedClaimUpdate(claimId: string): Promise<boolean> {
	if (pendingAckClaimId || loading) return false;

	const resolvedClaim =
		needsReviewClaims.find((c) => c.claimId === claimId) ||
		claims.find((c) => c.claimId === claimId) ||
		null;
	const previousClaimPending = resolvedClaim?.pendingUpdate ?? false;
	const previousEntryPending =
		trackedClaimEntries.find((e) => e.claimId === claimId)?.pendingUpdate ?? false;

	pendingAckClaimId = claimId;
	claimAckError = null;

	updateClaim(claimId, (claim) => ({ ...claim, pendingUpdate: false }));
	trackedClaimEntries = trackedClaimEntries.map((entry) =>
		entry.claimId === claimId ? { ...entry, pendingUpdate: false } : entry,
	);

	try {
		const response = await fetch('/api/claims/tracked/ack', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ claimId }),
		});

		if (response.status === 401) {
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return false;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
			entries?: TrackedClaimEntry[];
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			updateClaim(claimId, (claim) => ({ ...claim, pendingUpdate: previousClaimPending }));
			trackedClaimEntries = trackedClaimEntries.map((entry) =>
				entry.claimId === claimId ? { ...entry, pendingUpdate: previousEntryPending } : entry,
			);
			claimAckError = (body && body.error) || RADAR_CLAIMS_TRACKED_ACK_ERROR;
			return false;
		}

		if (body && Array.isArray(body.entries)) {
			trackedClaimEntries = body.entries;
		} else {
			await loadRadar();
		}

		return true;
	} catch (err) {
		console.error('Error acknowledging tracked claim update', err);
		updateClaim(claimId, (claim) => ({ ...claim, pendingUpdate: previousClaimPending }));
		trackedClaimEntries = trackedClaimEntries.map((entry) =>
			entry.claimId === claimId ? { ...entry, pendingUpdate: previousEntryPending } : entry,
		);
		claimAckError = RADAR_NETWORK_ERROR;
		return false;
	} finally {
		pendingAckClaimId = null;
	}
}

async function toggleClaimAccept(claim: ClaimRadarItem): Promise<void> {
	if (pendingClaimId || loading) return;

	const nextAccepted = !claim.accepted;
	const previousAccepted = claim.accepted;
	const previousTracked = claim.tracked;
	const hadTrackedEntry = trackedClaimEntries.some((entry) => entry.claimId === claim.claimId);

	claimAcceptError = null;
	pendingClaimId = claim.claimId;

	updateClaim(claim.claimId, (c) => ({
		...c,
		accepted: nextAccepted,
		tracked: nextAccepted ? true : c.tracked,
	}));

	try {
		const response = await fetch(nextAccepted ? '/api/claims/accept' : '/api/claims/unaccept', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ claimId: claim.claimId }),
		});

		if (response.status === 401) {
			updateClaim(claim.claimId, (c) => ({
				...c,
				accepted: previousAccepted,
				tracked: previousTracked,
			}));
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
			acceptedClaimIds?: string[];
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			updateClaim(claim.claimId, (c) => ({
				...c,
				accepted: previousAccepted,
				tracked: previousTracked,
			}));
			claimAcceptError = (body && body.error) || RADAR_CLAIMS_ACCEPT_ERROR;
			return;
		}

		if (nextAccepted && (claim.needsReview || !hadTrackedEntry)) {
			await loadRadar();
		}
	} catch (err) {
		console.error('Error toggling claim membership', err);
		updateClaim(claim.claimId, (c) => ({
			...c,
			accepted: previousAccepted,
			tracked: previousTracked,
		}));
		claimAcceptError = RADAR_NETWORK_ERROR;
	} finally {
		pendingClaimId = null;
	}
}

async function markClaimReviewed(claimId: string): Promise<void> {
	if (pendingReviewedClaimId || pendingReviewAll || loading) return;

	pendingReviewedClaimId = claimId;
	claimReviewError = null;

	try {
		const response = await fetch('/api/claims/review/dismiss', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ claimId }),
		});

		if (response.status === 401) {
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			claimReviewError = (body && body.error) || RADAR_CLAIMS_MARK_REVIEWED_ERROR;
			return;
		}

		await loadRadar();
	} catch (err) {
		console.error('Error marking claim reviewed', err);
		claimReviewError = RADAR_NETWORK_ERROR;
	} finally {
		pendingReviewedClaimId = null;
	}
}

async function markAllClaimsReviewed(): Promise<void> {
	if (pendingReviewedClaimId || pendingReviewAll || loading || needsReviewClaims.length === 0)
		return;
	if (!confirm(markAllReviewedConfirm(needsReviewClaims.length))) return;

	pendingReviewAll = true;
	claimReviewError = null;

	try {
		const response = await fetch('/api/claims/review/dismiss-all', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
		});

		if (response.status === 401) {
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			claimReviewError = (body && body.error) || RADAR_CLAIMS_MARK_REVIEWED_ERROR;
			return;
		}

		await loadRadar();
	} catch (err) {
		console.error('Error marking all claims reviewed', err);
		claimReviewError = RADAR_NETWORK_ERROR;
	} finally {
		pendingReviewAll = false;
	}
}

async function toggleClaimTrack(claimId: string, currentlyTracked: boolean): Promise<void> {
	if (pendingTrackClaimId || loading) return;
	const previousTracked = currentlyTracked;
	const nextTracked = !currentlyTracked;
	claimTrackError = null;
	pendingTrackClaimId = claimId;
	updateClaim(claimId, (claim) => ({ ...claim, tracked: nextTracked }));

	try {
		const response = await fetch(nextTracked ? '/api/claims/track' : '/api/claims/untrack', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ claimId }),
		});

		if (response.status === 401) {
			updateClaim(claimId, (claim) => ({ ...claim, tracked: previousTracked }));
			unauthenticated = true;
			needsReviewClaims = [];
			claims = [];
			clusters = [];
			trackedEntries = [];
			trackedClaimEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			claimsError = null;
			clustersError = null;
			return;
		}

		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
			entries?: TrackedClaimEntry[];
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			updateClaim(claimId, (claim) => ({ ...claim, tracked: previousTracked }));
			claimTrackError = (body && body.error) || RADAR_CLAIMS_TRACK_ERROR;
			return;
		}

		if (body && Array.isArray(body.entries)) {
			trackedClaimEntries = body.entries;
		} else {
			await loadRadar();
		}
	} catch (err) {
		console.error('Error toggling tracked claims', err);
		updateClaim(claimId, (claim) => ({ ...claim, tracked: previousTracked }));
		claimTrackError = RADAR_NETWORK_ERROR;
	} finally {
		pendingTrackClaimId = null;
	}
}

onMount(() => {
	void loadRadar(true);
});
</script>

<svelte:head>
	<title>{RADAR_PAGE_TITLE}</title>
	<meta name="description" content={RADAR_PAGE_DESCRIPTION} />
</svelte:head>

<div
	class="min-h-screen bg-app-bg text-gray-900 dark:text-gray-100"
	style="font-family: var(--font-lufga), system-ui, sans-serif;"
>
	<main class="mx-auto max-w-3xl px-4 py-12 sm:py-16">
		<p class="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">
			{PRODUCT_NAME}
		</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Radar</h1>
		<p class="mt-3 text-base text-gray-600 dark:text-gray-300">
			Claim inbox for extract triage, plus a secondary headline-cluster feed for story desk actions.
		</p>
		{#if loading}
			<p class="mt-8 text-sm text-gray-600 dark:text-gray-300">Loading radar…</p>
		{:else if unauthenticated}
			<section
				class="mt-8 max-w-sm rounded-md border border-gray-200 bg-white/80 p-4 text-sm shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/70"
				aria-label="Radar login"
			>
				<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
					Session required
				</h2>
				<p class="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
					{RADAR_LOGIN_INTRO}
				</p>

				{#if loginError}
					<p class="mt-3 text-xs text-red-600 dark:text-red-400">
						{loginError}
					</p>
				{/if}

				<form class="mt-4 space-y-3" on:submit={handleLogin}>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">
						MVP password
						<input
							type="password"
							class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
							autocomplete="current-password"
							bind:value={password}
						/>
					</label>
					<button
						type="submit"
						class="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-100 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-offset-gray-900"
						disabled={loggingIn || !password}
					>
						{#if loggingIn}
							Signing in…
						{:else}
							Sign in
						{/if}
					</button>
				</form>
			</section>
		{:else}
			{#if claimsError}
				<p class="mt-8 text-sm text-red-600 dark:text-red-400">
					{claimsError}
				</p>
			{/if}

			{#if acceptError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{acceptError}
				</p>
			{/if}

			{#if claimAcceptError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{claimAcceptError}
				</p>
			{/if}

			{#if trackError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{trackError}
				</p>
			{/if}

			{#if claimTrackError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{claimTrackError}
				</p>
			{/if}

			{#if ackError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{ackError}
				</p>
			{/if}

			{#if claimAckError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{claimAckError}
				</p>
			{/if}

			{#if claimReviewError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{claimReviewError}
				</p>
			{/if}

			{#if hiddenMutedCount > 0}
				<p class="mt-6 text-xs font-medium text-gray-500 dark:text-gray-400">
					{RADAR_HIDDEN_MUTED_PREFIX} {hiddenMutedCount}
				</p>
			{/if}

			{#if needsReviewClaims.length > 0}
				<section class="mt-8 space-y-4" aria-label="Claims needing review">
					<header class="flex items-center justify-between gap-3">
						<div class="space-y-1">
							<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
								{RADAR_CLAIMS_NEEDS_REVIEW_TITLE}
							</h2>
						</div>
						<button
							type="button"
							class="shrink-0 text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
							disabled={pendingReviewAll || pendingReviewedClaimId !== null}
							on:click={markAllClaimsReviewed}
						>
							{#if pendingReviewAll}
								{RADAR_CLAIMS_MARK_REVIEWED_PENDING}
							{:else}
								{RADAR_CLAIMS_MARK_ALL_REVIEWED_LABEL}
							{/if}
						</button>
					</header>

					<ul class="space-y-3">
						{#each needsReviewClaims as claim (claim.claimId)}
							<li class="rounded-md border border-gray-200 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
											{claim.text}
										</p>
										<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												{humanizeLabel(claim.status)}
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												{humanizeLabel(claim.claimType)}
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												Evidence {claim.evidence.total} (S{claim.evidence.supports} C{claim.evidence.contradicts} M{claim.evidence.mentions})
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												Primary {claim.evidence.primary} · Sensor {claim.evidence.sensor}
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												Confidence {formatConfidence(claim.confidence)}
											</span>
										</div>

										{#if claim.reviewReasons && claim.reviewReasons.length > 0}
											<ul class="mt-2 list-disc pl-5 text-[11px] text-gray-600 dark:text-gray-300">
												{#each claim.reviewReasons as reason (reason)}
													<li>{reason}</li>
												{/each}
											</ul>
										{/if}
									</div>

									<div class="shrink-0 flex flex-col items-end gap-2">
										<div class="flex items-center gap-3">
											{#if claim.pendingUpdate}
												<button
													type="button"
													class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
													disabled={pendingAckClaimId !== null}
													on:click={() => ackTrackedClaimUpdate(claim.claimId)}
												>
													{#if pendingAckClaimId === claim.claimId}
														{RADAR_TRACKED_DISMISS_PENDING}
													{:else}
														{RADAR_TRACKED_DISMISS_LABEL}
													{/if}
												</button>
											{/if}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingClaimId === claim.claimId}
												aria-pressed={claim.accepted}
												on:click={() => toggleClaimAccept(claim)}
											>
												{#if pendingClaimId === claim.claimId}
													{RADAR_ACCEPT_PENDING}
												{:else if claim.accepted}
													{RADAR_UNACCEPT_LABEL}
												{:else}
													{RADAR_ACCEPT_LABEL}
												{/if}
											</button>
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingTrackClaimId === claim.claimId}
												aria-pressed={claim.tracked}
												on:click={() => toggleClaimTrack(claim.claimId, claim.tracked)}
											>
												{#if pendingTrackClaimId === claim.claimId}
													{RADAR_TRACK_PENDING}
												{:else if claim.tracked}
													{RADAR_UNTRACK_LABEL}
												{:else}
													{RADAR_TRACK_LABEL}
												{/if}
											</button>
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingReviewAll || pendingReviewedClaimId !== null}
												on:click={() => markClaimReviewed(claim.claimId)}
											>
												{#if pendingReviewedClaimId === claim.claimId}
													{RADAR_CLAIMS_MARK_REVIEWED_PENDING}
												{:else}
													{RADAR_CLAIMS_MARK_REVIEWED_LABEL}
												{/if}
											</button>
										</div>
										{#if claim.linkedHeadlines.length > 0}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
												aria-expanded={expandedClaimIds.has(claim.claimId)}
												on:click={() => toggleClaimExpanded(claim.claimId)}
											>
												{expandedClaimIds.has(claim.claimId) ? RADAR_CLAIMS_HIDE_HEADLINES : RADAR_CLAIMS_SHOW_HEADLINES}
												({claim.linkedHeadlines.length})
											</button>
										{/if}
									</div>
								</div>

								{#if expandedClaimIds.has(claim.claimId)}
									<div class="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
										<p class="text-[11px] font-medium text-gray-700 dark:text-gray-300">
											{RADAR_CLAIMS_LINKED_HEADLINES_LABEL}
										</p>
										<ul class="mt-2 space-y-2">
											{#each claim.linkedHeadlines as headline (headline.id)}
												<li class="flex flex-col gap-0.5">
													<a
														href={headline.canonicalUrl}
														target="_blank"
														rel="noreferrer"
														class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
													>
														{headline.title}
													</a>
													<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
														{#if headline.publisherDomain}
															<span>{headline.publisherDomain}</span>
														{/if}
														<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
															{headline.sourceTier === 'primary' ? 'PRIMARY' : 'SENSOR'}
														</span>
														<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
															{headline.stance}
														</span>
														{#if headline.publishedAt}
															<span>· {formatDateTime(headline.publishedAt)}</span>
														{/if}
													</div>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="mt-8 space-y-4" aria-label="Claims">
				<header class="space-y-1">
					<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
						{RADAR_CLAIMS_SECTION_TITLE}
					</h2>
				</header>

				{#if needsReviewClaims.length === 0 && claims.length === 0 && !claimsError}
					<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
						{RADAR_CLAIMS_EMPTY_COPY}
					</p>
				{:else if claims.length > 0}
					<ul class="space-y-3">
						{#each claims as claim (claim.claimId)}
							<li class="rounded-md border border-gray-200 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
											{claim.text}
										</p>
										<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												{humanizeLabel(claim.status)}
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												{humanizeLabel(claim.claimType)}
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												Evidence {claim.evidence.total} (S{claim.evidence.supports} C{claim.evidence.contradicts} M{claim.evidence.mentions})
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												Primary {claim.evidence.primary} · Sensor {claim.evidence.sensor}
											</span>
											<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
												Confidence {formatConfidence(claim.confidence)}
											</span>
										</div>
									</div>

									<div class="shrink-0 flex flex-col items-end gap-2">
										<div class="flex items-center gap-3">
											{#if claim.pendingUpdate}
												<button
													type="button"
													class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
													disabled={pendingAckClaimId !== null}
													on:click={() => ackTrackedClaimUpdate(claim.claimId)}
												>
													{#if pendingAckClaimId === claim.claimId}
														{RADAR_TRACKED_DISMISS_PENDING}
													{:else}
														{RADAR_TRACKED_DISMISS_LABEL}
													{/if}
												</button>
											{/if}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingClaimId === claim.claimId}
												aria-pressed={claim.accepted}
												on:click={() => toggleClaimAccept(claim)}
											>
												{#if pendingClaimId === claim.claimId}
													{RADAR_ACCEPT_PENDING}
												{:else if claim.accepted}
													{RADAR_UNACCEPT_LABEL}
												{:else}
													{RADAR_ACCEPT_LABEL}
												{/if}
											</button>
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingTrackClaimId === claim.claimId}
												aria-pressed={claim.tracked}
												on:click={() => toggleClaimTrack(claim.claimId, claim.tracked)}
											>
												{#if pendingTrackClaimId === claim.claimId}
													{RADAR_TRACK_PENDING}
												{:else if claim.tracked}
													{RADAR_UNTRACK_LABEL}
												{:else}
													{RADAR_TRACK_LABEL}
												{/if}
											</button>
										</div>
										{#if claim.linkedHeadlines.length > 0}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
												aria-expanded={expandedClaimIds.has(claim.claimId)}
												on:click={() => toggleClaimExpanded(claim.claimId)}
											>
												{expandedClaimIds.has(claim.claimId) ? RADAR_CLAIMS_HIDE_HEADLINES : RADAR_CLAIMS_SHOW_HEADLINES}
												({claim.linkedHeadlines.length})
											</button>
										{/if}
									</div>
								</div>

								{#if expandedClaimIds.has(claim.claimId)}
									<div class="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
										<p class="text-[11px] font-medium text-gray-700 dark:text-gray-300">
											{RADAR_CLAIMS_LINKED_HEADLINES_LABEL}
										</p>
										<ul class="mt-2 space-y-2">
											{#each claim.linkedHeadlines as headline (headline.id)}
												<li class="flex flex-col gap-0.5">
													<a
														href={headline.canonicalUrl}
														target="_blank"
														rel="noreferrer"
														class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
													>
														{headline.title}
													</a>
													<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
														{#if headline.publisherDomain}
															<span>{headline.publisherDomain}</span>
														{/if}
														<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
															{headline.sourceTier === 'primary' ? 'PRIMARY' : 'SENSOR'}
														</span>
														<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
															{headline.stance}
														</span>
														{#if headline.publishedAt}
															<span>· {formatDateTime(headline.publishedAt)}</span>
														{/if}
													</div>
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if trackedClaimEntries.length > 0}
				<section class="mt-8 space-y-4" aria-label="Tracked claims">
					<header class="space-y-1">
						<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
							{RADAR_CLAIMS_TRACKED_SECTION_TITLE}
						</h2>
						<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
							{RADAR_CLAIMS_TRACKED_SECTION_HELP}
						</p>
					</header>

					<ul class="space-y-3">
						{#each trackedClaimRows() as row (row.entry.claimId)}
							<li class="rounded-md border border-gray-200 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										{#if row.kind === 'resolved'}
											<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
												{row.claim.text}
											</p>
											<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
												<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
													{humanizeLabel(row.claim.status)}
												</span>
												<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
													{humanizeLabel(row.claim.claimType)}
												</span>
												<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
													Evidence {row.claim.evidence.total} (S{row.claim.evidence.supports} C{row.claim.evidence.contradicts} M{row.claim.evidence.mentions})
												</span>
											</div>
										{:else}
											<p class="text-xs text-gray-500 dark:text-gray-400">
												Claim:
												<span class="font-mono text-[11px]">{row.entry.claimId}</span>
											</p>
										{/if}

										{#if row.entry.pendingUpdate}
											<p class="mt-1 inline-flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
												<span class="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true"></span>
												{RADAR_TRACKED_UPDATE_BADGE}
											</p>
										{/if}
									</div>

									<div class="shrink-0 flex items-center gap-3">
										{#if row.entry.pendingUpdate}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingAckClaimId !== null}
												on:click={() => ackTrackedClaimUpdate(row.entry.claimId)}
											>
												{#if pendingAckClaimId === row.entry.claimId}
													{RADAR_TRACKED_DISMISS_PENDING}
												{:else}
													{RADAR_TRACKED_DISMISS_LABEL}
												{/if}
											</button>
										{/if}
										{#if row.kind === 'resolved'}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingClaimId === row.entry.claimId}
												aria-pressed={row.claim.accepted}
												on:click={() => toggleClaimAccept(row.claim)}
											>
												{#if pendingClaimId === row.entry.claimId}
													{RADAR_ACCEPT_PENDING}
												{:else if row.claim.accepted}
													{RADAR_UNACCEPT_LABEL}
												{:else}
													{RADAR_ACCEPT_LABEL}
												{/if}
											</button>
										{/if}
										<button
											type="button"
											class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
											disabled={pendingTrackClaimId === row.entry.claimId}
											aria-pressed={true}
											on:click={() => toggleClaimTrack(row.entry.claimId, true)}
										>
											{#if pendingTrackClaimId === row.entry.claimId}
												{RADAR_TRACK_PENDING}
											{:else}
												{RADAR_UNTRACK_LABEL}
											{/if}
										</button>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if trackedEntries.length > 0}
				<section class="mt-8 space-y-4" aria-label="Tracked clusters">
					<header class="space-y-1">
						<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
							{RADAR_TRACKED_SECTION_TITLE}
						</h2>
						<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
							{RADAR_TRACKED_SECTION_HELP}
						</p>
					</header>

					<ul class="space-y-3">
						{#each trackedClusterRows() as row (row.entry.clusterId)}
							<li class="rounded-md border border-gray-200 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										{#if row.kind === 'resolved'}
											{#if row.cluster.newestAt}
												<p class="text-xs text-gray-500 dark:text-gray-400">
													Latest in cluster:
													<span class="font-medium">{formatDateTime(row.cluster.newestAt)}</span>
												</p>
											{/if}
										{:else}
											<p class="text-xs text-gray-500 dark:text-gray-400">
												Cluster:
												<span class="font-mono text-[11px]">{row.entry.clusterId}</span>
											</p>
										{/if}
										{#if row.entry.pendingUpdate}
											<p class="mt-1 inline-flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
												<span class="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true"></span>
												{RADAR_TRACKED_UPDATE_BADGE}
											</p>
										{/if}
										{#if row.entry.muted}
											<p class="mt-1 text-[11px] font-medium text-gray-600 dark:text-gray-400">
												{RADAR_MUTED_LABEL}
											</p>
										{/if}
									</div>

									<div class="shrink-0 flex items-center gap-3">
										{#if row.entry.pendingUpdate}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingAckClusterId !== null}
												on:click={() => ackTrackedUpdate(row.entry.clusterId)}
											>
												{#if pendingAckClusterId !== null}
													{RADAR_TRACKED_DISMISS_PENDING}
												{:else}
													{RADAR_TRACKED_DISMISS_LABEL}
												{/if}
											</button>
										{/if}
										{#if row.kind === 'resolved' && row.cluster.accepted}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={row.entry.pendingUpdate && pendingAckClusterId !== null}
												on:click={() => openOnBrief(row.entry.clusterId, row.entry.pendingUpdate)}
											>
												Open on Brief
											</button>
										{/if}
										{#if row.kind === 'resolved'}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingClusterId === row.entry.clusterId}
												aria-pressed={row.cluster.accepted}
												on:click={() => toggleAccept(row.cluster)}
											>
												{#if pendingClusterId === row.entry.clusterId}
													{RADAR_ACCEPT_PENDING}
												{:else if row.cluster.accepted}
													{RADAR_UNACCEPT_LABEL}
												{:else}
													{RADAR_ACCEPT_LABEL}
												{/if}
											</button>
										{/if}
										<button
											type="button"
											class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
											disabled={pendingTrackClusterId === row.entry.clusterId}
											aria-pressed={true}
											on:click={() => toggleTrack(row.entry.clusterId, true)}
										>
											{#if pendingTrackClusterId === row.entry.clusterId}
												{RADAR_TRACK_PENDING}
											{:else}
												{RADAR_UNTRACK_LABEL}
											{/if}
										</button>
									</div>
								</div>

								{#if row.kind === 'resolved'}
									<ul class="mt-2 space-y-1">
										{#each row.cluster.headlines as headline (headline.id)}
											<li class="flex flex-col gap-0.5">
												<a
													href={headline.canonicalUrl}
													target="_blank"
													rel="noreferrer"
													class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
												>
													{headline.title}
												</a>
												<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
													{#if headline.publisherDomain}
														<span>{headline.publisherDomain}</span>
													{/if}
													<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
														{headline.sourceKind === 'cfp' ? 'CFP' : 'RSS'}
													</span>
													{#if headline.citationLabel}
														<span>· {headline.citationLabel}</span>
													{/if}
													{#if headline.publishedAt}
														<span>· {formatDateTime(headline.publishedAt)}</span>
													{/if}
												</div>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="mt-8 space-y-4" aria-label="Mute rules">
				<header class="space-y-1">
					<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
						{RADAR_MUTES_SECTION_TITLE}
					</h2>
					<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
						{RADAR_MUTES_SECTION_HELP}
					</p>
				</header>

				{#if muteLoadError}
					<p class="text-xs text-red-600 dark:text-red-400">{muteLoadError}</p>
				{/if}

				{#if muteActionError}
					<p class="text-xs text-red-600 dark:text-red-400">{muteActionError}</p>
				{/if}

				<form class="flex flex-col gap-3 sm:flex-row sm:items-end" on:submit={addMuteRule}>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
						{RADAR_MUTES_KEYWORD_LABEL}
						<input
							type="text"
							class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
							placeholder="keyword"
							bind:value={keyword}
						/>
					</label>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
						{RADAR_MUTES_SOURCE_LABEL}
						<input
							type="text"
							class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
							placeholder="domain or source"
							bind:value={source}
						/>
					</label>
					<button
						type="submit"
						class="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-100 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-offset-gray-900"
						disabled={pendingMute || !keyword.trim()}
					>
						{RADAR_MUTES_ADD_LABEL}
					</button>
				</form>

				{#if muteRules.length === 0}
					<p class="text-xs text-gray-600 dark:text-gray-400">{RADAR_MUTES_EMPTY_COPY}</p>
				{:else}
					<ul class="space-y-2">
						{#each muteRules as rule (rule.id)}
							<li class="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white/70 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
								<div class="min-w-0">
									<span class="font-medium text-gray-900 dark:text-gray-100">{rule.keyword}</span>
									{#if rule.source}
										<span class="ml-2 text-gray-500 dark:text-gray-400">({rule.source})</span>
									{/if}
								</div>
								<button
									type="button"
									class="shrink-0 text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
									disabled={pendingDeleteMuteId === rule.id}
									on:click={() => deleteMuteRule(rule.id)}
								>
									{RADAR_MUTES_DELETE_LABEL}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<details
				class="mt-8 rounded-md border border-gray-200 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/50"
				aria-label="Headline clusters"
			>
				<summary class="cursor-pointer text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
					{RADAR_HEADLINE_CLUSTERS_SECTION_TITLE}
					<span class="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">({clusters.length})</span>
				</summary>

				<div class="mt-3 space-y-4">
					<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
						{RADAR_META_HELP}
					</p>

					{#if clustersError}
						<p class="text-xs text-red-600 dark:text-red-400">{clustersError}</p>
					{/if}

					{#if meta}
						<div class="space-y-1 text-xs text-gray-500 dark:text-gray-400" aria-label="Radar ingest status">
							<p>
								<span class="font-medium">Last fetch:</span>
								<span class="ml-1">{formatDateTime(meta.lastFetchAt)}</span>
							</p>
							{#if meta.lastError}
								<p>
									<span class="font-medium">Last ingest error:</span>
									<span class="ml-1">{meta.lastError}</span>
								</p>
							{/if}
						</div>
					{/if}

					{#if clusters.length === 0 && !clustersError}
						<p class="text-xs text-gray-600 dark:text-gray-400">{RADAR_EMPTY_COPY}</p>
					{:else if clusters.length > 0}
						<section class="space-y-6" aria-label="Headline clusters list">
							{#each clusters as cluster}
								<article class="border-l border-gray-200 pl-4 dark:border-gray-700">
									<div class="flex items-baseline justify-between gap-3">
										{#if cluster.newestAt}
											<p class="text-xs text-gray-500 dark:text-gray-400">
												Latest in cluster:
												<span class="font-medium">{formatDateTime(cluster.newestAt)}</span>
											</p>
										{:else}
											<span class="text-xs text-gray-500 dark:text-gray-400"></span>
										{/if}
										<div class="shrink-0 flex items-center gap-3">
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingTrackClusterId === cluster.clusterId}
												aria-pressed={cluster.tracked}
												on:click={() => toggleTrack(cluster.clusterId, cluster.tracked)}
											>
												{#if pendingTrackClusterId === cluster.clusterId}
													{RADAR_TRACK_PENDING}
												{:else if cluster.tracked}
													{RADAR_UNTRACK_LABEL}
												{:else}
													{RADAR_TRACK_LABEL}
												{/if}
											</button>
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingClusterId === cluster.clusterId}
												aria-pressed={cluster.accepted}
												on:click={() => toggleAccept(cluster)}
											>
												{#if pendingClusterId === cluster.clusterId}
													{RADAR_ACCEPT_PENDING}
												{:else if cluster.accepted}
													{RADAR_UNACCEPT_LABEL}
												{:else}
													{RADAR_ACCEPT_LABEL}
												{/if}
											</button>
										</div>
									</div>

									<ul class="mt-2 space-y-1">
										{#each cluster.headlines as headline}
											<li class="flex flex-col gap-0.5">
												<a
													href={headline.canonicalUrl}
													target="_blank"
													rel="noreferrer"
													class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
												>
													{headline.title}
												</a>
												<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
													{#if headline.publisherDomain}
														<span>{headline.publisherDomain}</span>
													{/if}
													<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
														{headline.sourceKind === 'cfp' ? 'CFP' : 'RSS'}
													</span>
													{#if headline.citationLabel}
														<span>· {headline.citationLabel}</span>
													{/if}
													{#if headline.publishedAt}
														<span>· {formatDateTime(headline.publishedAt)}</span>
													{/if}
												</div>
											</li>
										{/each}
									</ul>
								</article>
							{/each}
						</section>
					{/if}
				</div>
			</details>

			<div class="mt-8 flex items-center justify-between">
				<p class="text-xs text-gray-500 dark:text-gray-400">
					Inbox only — open links to read full context at the cited sources.
				</p>
				<button
					type="button"
					class="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					on:click={handleLogout}
				>
					Log out
				</button>
			</div>
		{/if}

		<p class="mt-12">
			<a
				href="/"
				class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				← Back to Brief
			</a>
		</p>
	</main>
</div>

