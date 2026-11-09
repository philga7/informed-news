<script lang="ts">
	import {
		BRIEF_ADDED_BY_YOU_LABEL,
		BRIEF_FULL_STORY_LOADING,
		BRIEF_FULL_STORY_LOGIN_HINT,
		BRIEF_OFFICIAL_LABEL,
		BRIEF_SUMMARY_ERROR,
		BRIEF_SUMMARY_LOADING,
		BRIEF_SUMMARY_LOGIN_HINT,
		articleLinks,
		fullStoryLine,
		isManualSeedStory,
		isOfficialStory,
		isTopicBriefStory,
		outletBadge,
		storyKey,
		summaryLine,
	} from './assemble';
	import { hasAssistedBody, talkingPoints, type BriefStory } from './briefClient';
	import { blurredStoryAccessibleName } from './keyboard';
	import CitationGuardMarks from './CitationGuardMarks.svelte';
	import FeedbackButtons from './FeedbackButtons.svelte';
	import LessLikeThis from './LessLikeThis.svelte';
	import SeedRemove from './SeedRemove.svelte';
	import VerdictReasonExpander from './VerdictReasonExpander.svelte';

	const ASSISTED_NOTE = 'AI-assisted — not ground truth.';

	interface Props {
		story: BriefStory;
		storyIndex: number;
		expanded: boolean;
		blurred: boolean;
		blurKeywords: string[];
		selected: boolean;
		linked: boolean;
		shared: boolean;
		read: boolean;
		summaryPhase?: 'loading' | 'login' | 'error';
		fullPhase?: { phase: 'loading' | 'login' | 'error'; message?: string };
		onToggle: () => void;
		onReveal: () => void;
		onReadToggle: () => void;
		onRemoved: () => void;
	}

	let {
		story,
		storyIndex,
		expanded,
		blurred,
		blurKeywords,
		selected,
		linked,
		shared,
		read,
		summaryPhase,
		fullPhase,
		onToggle,
		onReveal,
		onReadToggle,
		onRemoved,
	}: Props = $props();

	const key = $derived(storyKey(story));
	const label = $derived(story.informed_topic_name?.trim() || story.category || '');
	const line = $derived(summaryLine(story));
	const unavailable = $derived(fullStoryLine(story));
	const badge = $derived(outletBadge(story.informed_outlet_count));
	const points = $derived(talkingPoints(story));
	const assisted = $derived(hasAssistedBody(story));
	const articleId = $derived(
		isTopicBriefStory(story) ? (story.informed_article_id ?? null) : null,
	);
	const sources = $derived(articleLinks(story));
	const manual = $derived(isManualSeedStory(story));
	const official = $derived(isOfficialStory(story));
	const reason = $derived(story.informed_reason_text?.trim() ?? '');
	const showContent = $derived(expanded || shared);
	const domId = $derived(
		typeof story.cluster_number === 'number' ? `story-${story.cluster_number}` : undefined,
	);

	function onBlurredKey(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onReveal();
	}

	function missingSummaryKind(
		phase: 'loading' | 'login' | 'error' | undefined,
	): 'loading' | 'login' | 'error' | 'pending' {
		switch (phase) {
			case 'loading':
			case 'login':
			case 'error':
				return phase;
			case undefined:
				return 'pending';
			default: {
				const unreachable: never = phase;
				return unreachable;
			}
		}
	}
</script>

{#snippet body()}
	<div class="category-label">
		{label}
		{#if read && !shared && !blurred}<span class="read-badge">Read</span>{/if}
	</div>
	<div class="title-row">
		{#if shared}
			<div class="title-text">{story.title}</div>
		{:else if blurred}
			<div class="title-text">{story.title}</div>
		{:else}
			<button type="button" class="title-button" aria-expanded={expanded ? 'true' : 'false'} onclick={onToggle}>
				{story.title}
			</button>
		{/if}
		{#if !shared && !blurred}
			<button
				type="button"
				class="read-button"
				aria-label={read ? 'Mark as unread' : 'Mark as read'}
				onclick={onReadToggle}
			>
				{read ? 'Mark as unread' : 'Mark as read'}
			</button>
		{/if}
	</div>
	{#if badge || official || manual}
		<p class="meta">
			{#if manual}<span>{BRIEF_ADDED_BY_YOU_LABEL}</span>{/if}
			{#if official}<span>{BRIEF_OFFICIAL_LABEL}</span>{/if}
			{#if badge}<span>{badge}</span>{/if}
		</p>
	{/if}
	{#if line?.kind === 'ok'}
		{#if !showContent}
			<p>{line.text}</p>
		{/if}
		<p>{line.note}</p>
	{:else if line?.kind === 'missing'}
		{@const summaryKind = missingSummaryKind(summaryPhase)}
		{#if summaryKind === 'loading'}
			<p aria-live="polite">{BRIEF_SUMMARY_LOADING}</p>
		{:else if summaryKind === 'login'}
			<p><a href="/topics">{BRIEF_SUMMARY_LOGIN_HINT}</a></p>
		{:else if summaryKind === 'error'}
			<p>{BRIEF_SUMMARY_ERROR}</p>
		{:else}
			<p>{line.text}</p>
		{/if}
	{:else if line}
		<p>{line.text}</p>
	{/if}
	{#if sources.length > 0}
		<ul class="article-links">
			{#each sources as source (source.href)}
				<li><a href={source.href}>{source.label}</a></li>
			{/each}
		</ul>
	{/if}
	{#if !blurred}
		{#if showContent && unavailable}
			<p>{unavailable.text}</p>
		{/if}
		{#if showContent && fullPhase?.phase === 'loading'}
			<p aria-live="polite">{BRIEF_FULL_STORY_LOADING}</p>
		{:else if showContent && fullPhase?.phase === 'login'}
			<p><a href="/topics">{BRIEF_FULL_STORY_LOGIN_HINT}</a></p>
		{:else if showContent && fullPhase?.phase === 'error'}
			<p>{fullPhase.message}</p>
		{/if}
		{#if showContent && story.informed_full_story_updated}
			<p>Updated: {story.informed_full_story_updated}</p>
		{/if}
		{#if showContent && story.timeline && story.timeline.length > 0}
			<ul>
				{#each story.timeline as event, index (key + ':t:' + index)}
					<li>{event.date ? `${event.date} — ` : ''}{event.content ?? ''}</li>
				{/each}
			</ul>
		{/if}
		{#if showContent && story.perspectives && story.perspectives.length > 0}
			<ul>
				{#each story.perspectives as perspective, index (key + ':p:' + index)}
					<li>
						{perspective.text}
						{#each perspective.sources ?? [] as source (source.url ?? source.name)}
							{#if source.url?.startsWith('http')}
								<a href={source.url}>{source.name || source.url}</a>
							{/if}
						{/each}
					</li>
				{/each}
			</ul>
		{/if}
		{#if showContent && story.quote}
			<blockquote>
				<p>{story.quote}</p>
				{#if story.quote_author}<p>{story.quote_author}</p>{/if}
			</blockquote>
		{/if}
		{#if reason}
			<VerdictReasonExpander reasonText={reason} criteriaRef={story.informed_criteria_ref ?? null} />
		{/if}
		{#if story.informed_citation_marks?.length}
			<CitationGuardMarks marks={story.informed_citation_marks} />
		{/if}
	{/if}
	{#if showContent && !blurred}
		<div role="region" aria-label="Story content">
			{#if points.length > 0}
				<ul>
					{#each points as point, index (key + ':' + index)}
						<li>{point}</li>
					{/each}
				</ul>
			{/if}
			{#if assisted}
				<p>{ASSISTED_NOTE}</p>
			{/if}
			{#if articleId}
				<FeedbackButtons itemId={articleId} />
				{#if manual}
					<SeedRemove {articleId} {onRemoved} />
				{:else}
					<LessLikeThis
						story={{ title: story.title, informed_publisher_domain: story.informed_publisher_domain }}
						{articleId}
					/>
				{/if}
			{/if}
		</div>
	{/if}
{/snippet}

{#if blurred}
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<article
		id={domId}
		class="story-card story-card-blurred"
		role="button"
		tabindex="0"
		aria-label={blurredStoryAccessibleName(blurKeywords)}
		aria-current={selected ? 'true' : undefined}
		data-story-index={storyIndex}
		data-linked-story={linked ? 'true' : undefined}
		onclick={onReveal}
		onkeydown={onBlurredKey}
	>
		<div class="story-card-body" aria-hidden="true">
			{@render body()}
		</div>
		<p class="reveal">Click to show</p>
	</article>
{:else}
	<article
		id={domId}
		class="story-card"
		class:story-card-read={read}
		aria-label={`News story: ${story.title}`}
		aria-current={selected ? 'true' : undefined}
		data-story-index={storyIndex}
		data-linked-story={linked ? 'true' : undefined}
		data-read={read ? 'true' : undefined}
	>
		{@render body()}
	</article>
{/if}

<style>
	.story-card {
		position: relative;
		padding: 0.75rem 0;
		border-bottom: 1px solid #e5e7eb;
	}

	/* Text badge plus a left rule and muted title, so read state is not colour alone. */
	.story-card-read {
		border-inline-start: 3px solid #6b7280;
		padding-inline-start: 0.5rem;
	}

	.story-card-read .title-button,
	.story-card-read .title-text {
		font-weight: 400;
		color: #4b5563;
	}

	.read-badge {
		margin-inline-start: 0.5rem;
		padding: 0 0.375rem;
		border: 1px solid #6b7280;
		border-radius: 0.25rem;
		color: #374151;
		text-transform: none;
	}

	.story-card-blurred {
		cursor: pointer;
	}

	.story-card-blurred .story-card-body {
		filter: blur(6px);
		pointer-events: none;
		user-select: none;
	}

	.category-label {
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.title-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		justify-content: space-between;
	}

	.title-button,
	.title-text {
		font-size: 1rem;
		font-weight: 600;
		text-align: start;
	}

	.title-button {
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		cursor: pointer;
	}

	.read-button {
		flex: none;
		font-size: 0.75rem;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #4b5563;
	}

	.reveal {
		margin: 0.25rem 0 0;
		font-size: 0.875rem;
	}
</style>
