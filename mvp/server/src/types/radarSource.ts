export type RadarSource = {
  id: string;
  name: string;
  domain: string;
  feedUrl: string;
  region?: string;
  /** Source-of-record tiering for claims desk. Absent in config → treated as 'sensor'. */
  sourceTier?: 'primary' | 'sensor';
  /** Defaults to true when absent in config. */
  enabled?: boolean;
};

export type RadarSourcesConfig = {
  sources: RadarSource[];
};
