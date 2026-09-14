/**
 * Public Transparency page copy (NEWS-32).
 * Keep claims factual — no ground-truth framing language.
 */

import { PRODUCT_NAME } from './brand';

export type TransparencySection = {
	id: string;
	title: string;
	paragraphs: string[];
};

export const TRANSPARENCY_PAGE_TITLE = `Transparency — ${PRODUCT_NAME}`;

export const TRANSPARENCY_INTRO = `${PRODUCT_NAME} publishes this page so readers can see how the product is funded, how Brief analysis is produced, how we handle mistakes, and who builds it. No login is required.`;

export const TRANSPARENCY_SECTIONS: TransparencySection[] = [
	{
		id: 'funding',
		title: 'Funding',
		paragraphs: [
			`${PRODUCT_NAME} is a proprietary product of Sandiebeach LLC (Informed Crew). At publication of this page, the project is early-stage and self-funded by its operator — we do not currently list outside institutional investors, advertisers, or sponsored-content partners.`,
			'If that changes (grants, investors, sponsorships, or paid partnerships), we will update this section with who pays, what they get, and what editorial controls remain with us. We do not sell story placement in the Brief.',
		],
	},
	{
		id: 'methodology',
		title: 'Methodology',
		paragraphs: [
			'The Brief pulls from owned ingest (today: Citizen Free Press RSS and optional xcancel profiles), stores dual citations when available (aggregator + original publisher), and may cluster related items. Framing and enrichment use AI models (Ollama Cloud) to produce structured analysis such as framing summaries, evidence quotes, and — as enrichment lands — highlights, timelines, and Q&A.',
			'That analysis is AI-assisted, not ground truth. It is not a left–right bias score, an outlet “trust” rating, or a claim verdict. Readers should verify important details against the cited sources. Summaries can be wrong, incomplete, or skewed by source selection.',
			'We intentionally reject spectrum meters, trust grids, and automated “verified / false” badges as product features.',
		],
	},
	{
		id: 'corrections',
		title: 'Corrections',
		paragraphs: [
			'If you find a factual error in Brief presentation, a broken citation, or misleading framing copy produced by our pipeline, tell us. We aim to investigate promptly, correct the underlying store or enrichment when we can, and note material corrections here or on the affected item when the product supports that.',
			'How to report: open a GitHub issue on the Informed News repository or contact the Informed Crew project channel used for product feedback. Include the story title or URL, what is wrong, and a preferred correction with sources if you have them.',
			'AI-generated framing text may be regenerated after a fix; we do not pretend model output is permanent editorial gospel.',
		],
	},
	{
		id: 'team',
		title: 'Team',
		paragraphs: [
			'Phil Clapper builds and operates Informed News under Sandiebeach LLC / Informed Crew. This is a small team in an early chapter — there is no large newsroom staff deciding story verdicts by committee.',
			'Upstream Brief UI code includes the MIT-licensed kite-public shell (Kagi Search). Product branding, owned brief data, and Informed News governance on this page are ours — not Kagi’s.',
		],
	},
];
