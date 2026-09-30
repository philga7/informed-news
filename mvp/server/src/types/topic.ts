export const TOPIC_KINDS = ['desired', 'undesired'] as const;
export const TOPIC_LEVELS = ['core', 'watch'] as const;
export const TOPIC_SECTIONS = ['business', 'technical', 'action', 'map', 'history'] as const;

export type TopicKind = (typeof TOPIC_KINDS)[number];
export type TopicLevel = (typeof TOPIC_LEVELS)[number];
export type TopicSection = (typeof TOPIC_SECTIONS)[number];

export type TopicFields = {
  name: string;
  kind: TopicKind;
  level: TopicLevel | null;
  description: string;
  keywords: string[];
  searchQuery: string;
  sections: TopicSection[];
  notes: string;
};
export type TopicPatch = Partial<TopicFields>;
export type Topic = TopicFields & { id: string; createdAt: string; updatedAt: string };
export type TopicsStore = { topics: Topic[]; updatedAt: string | null };
export type TopicSeedEntry = TopicFields & { id: string };
