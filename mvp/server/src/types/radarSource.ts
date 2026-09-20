export type RadarSource = {
  id: string;
  name: string;
  domain: string;
  feedUrl: string;
  region?: string;
  /** Defaults to true when absent in config. */
  enabled?: boolean;
};

export type RadarSourcesConfig = {
  sources: RadarSource[];
};
