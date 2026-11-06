export {
	FEEDBACK_COMMENT_MAX,
	briefCard,
	feedbackEntry,
	feedbackListBody,
	feedbackSavedBody,
	lessLikeThisSavedBody,
	lessLikeThisUrl,
	removeSeedSavedBody,
	removeSeedUrl,
	storyForLessLikeThis,
} from './fixtures';
export type {
	BriefCardFixture,
	FeedbackEntry,
	FeedbackSignal,
	LessLikeThisBody,
} from './fixtures';
export { installBriefFetchMock, jsonResponse } from './fetchMock';
export type { RecordedBriefFetch } from './fetchMock';
