import type { MediaComparisonPayload } from '../../services/analysis.service';

interface MediaComparisonCardProps {
  payload: MediaComparisonPayload;
}

export function MediaComparisonCard({ payload }: MediaComparisonCardProps) {
  return (
    <div className="space-y-6">
      {/* Coverage Analysis */}
      <div>
        <h5 className="text-xs font-semibold text-stone-400 uppercase mb-3">Coverage Analysis</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Unique to Articles */}
          {payload.coverageAnalysis.uniqueToArticles.length > 0 && (
            <div className="p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
              <h6 className="text-xs font-medium text-blue-400 mb-2">Unique to Articles</h6>
              <ul className="space-y-1.5">
                {payload.coverageAnalysis.uniqueToArticles.map((theme, index) => (
                  <li key={index} className="flex gap-2 text-sm text-stone-300">
                    <span className="text-blue-400 mt-1">•</span>
                    <span className="flex-1">{theme}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Unique to Videos */}
          {payload.coverageAnalysis.uniqueToVideos.length > 0 && (
            <div className="p-3 bg-purple-900/20 border border-purple-800/30 rounded-lg">
              <h6 className="text-xs font-medium text-purple-400 mb-2">
                Unique to Videos
                <span className="text-xs text-purple-500/70 ml-2">(title-based inference)</span>
              </h6>
              <ul className="space-y-1.5">
                {payload.coverageAnalysis.uniqueToVideos.map((theme, index) => (
                  <li key={index} className="flex gap-2 text-sm text-stone-300">
                    <span className="text-purple-400 mt-1">•</span>
                    <span className="flex-1">{theme}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Unique to Podcasts */}
          {payload.coverageAnalysis.uniqueToPodcasts.length > 0 && (
            <div className="p-3 bg-green-900/20 border border-green-800/30 rounded-lg">
              <h6 className="text-xs font-medium text-green-400 mb-2">Unique to Podcasts</h6>
              <ul className="space-y-1.5">
                {payload.coverageAnalysis.uniqueToPodcasts.map((theme, index) => (
                  <li key={index} className="flex gap-2 text-sm text-stone-300">
                    <span className="text-green-400 mt-1">•</span>
                    <span className="flex-1">{theme}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Common Themes */}
          {payload.coverageAnalysis.commonThemes.length > 0 && (
            <div className="p-3 bg-stone-800 border border-stone-700 rounded-lg">
              <h6 className="text-xs font-medium text-stone-400 mb-2">Common Themes</h6>
              <ul className="space-y-1.5">
                {payload.coverageAnalysis.commonThemes.map((theme, index) => (
                  <li key={index} className="flex gap-2 text-sm text-stone-300">
                    <span className="text-accent mt-1">•</span>
                    <span className="flex-1">{theme}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Perspective Differences */}
      {payload.perspectiveDifferences && payload.perspectiveDifferences.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-3">Perspective Differences</h5>
          <div className="space-y-3">
            {payload.perspectiveDifferences.map((diff, index) => (
              <div key={index} className="p-4 bg-stone-800 border border-stone-700 rounded-lg">
                <h6 className="text-sm font-medium text-stone-200 mb-3">{diff.topic}</h6>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-2 bg-blue-900/20 border border-blue-800/30 rounded">
                    <div className="text-xs font-medium text-blue-400 mb-1">Articles</div>
                    <p className="text-xs text-stone-300">{diff.articlePerspective}</p>
                  </div>
                  <div className="p-2 bg-purple-900/20 border border-purple-800/30 rounded">
                    <div className="text-xs font-medium text-purple-400 mb-1">
                      Videos
                      <span className="text-purple-500/70 ml-1">(inferred)</span>
                    </div>
                    <p className="text-xs text-stone-300">{diff.videoPerspective}</p>
                  </div>
                  {diff.podcastPerspective && (
                    <div className="p-2 bg-green-900/20 border border-green-800/30 rounded">
                      <div className="text-xs font-medium text-green-400 mb-1">Podcasts</div>
                      <p className="text-xs text-stone-300">{diff.podcastPerspective}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emphasis Analysis */}
      <div>
        <h5 className="text-xs font-semibold text-stone-400 uppercase mb-3">Emphasis Analysis</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {payload.emphasisAnalysis.articleEmphasis.length > 0 && (
            <div className="p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
              <h6 className="text-xs font-medium text-blue-400 mb-2">Articles Emphasize</h6>
              <ul className="space-y-1">
                {payload.emphasisAnalysis.articleEmphasis.map((emphasis, index) => (
                  <li key={index} className="text-sm text-stone-300">• {emphasis}</li>
                ))}
              </ul>
            </div>
          )}

          {payload.emphasisAnalysis.videoEmphasis.length > 0 && (
            <div className="p-3 bg-purple-900/20 border border-purple-800/30 rounded-lg">
              <h6 className="text-xs font-medium text-purple-400 mb-2">
                Videos Emphasize
                <span className="text-xs text-purple-500/70 ml-2">(from titles)</span>
              </h6>
              <ul className="space-y-1">
                {payload.emphasisAnalysis.videoEmphasis.map((emphasis, index) => (
                  <li key={index} className="text-sm text-stone-300">• {emphasis}</li>
                ))}
              </ul>
            </div>
          )}

          {payload.emphasisAnalysis.podcastEmphasis && payload.emphasisAnalysis.podcastEmphasis.length > 0 && (
            <div className="p-3 bg-green-900/20 border border-green-800/30 rounded-lg">
              <h6 className="text-xs font-medium text-green-400 mb-2">Podcasts Emphasize</h6>
              <ul className="space-y-1">
                {payload.emphasisAnalysis.podcastEmphasis.map((emphasis, index) => (
                  <li key={index} className="text-sm text-stone-300">• {emphasis}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Link Analysis */}
      {(payload.linkAnalysis.sharedLinks.length > 0 || 
        payload.linkAnalysis.mediaSpecificLinks.articles.length > 0 ||
        payload.linkAnalysis.mediaSpecificLinks.podcasts.length > 0) && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-3">Link Analysis</h5>
          <div className="space-y-3">
            {/* Shared Links */}
            {payload.linkAnalysis.sharedLinks.length > 0 && (
              <div>
                <h6 className="text-xs font-medium text-stone-400 mb-2">Shared Across Media Types</h6>
                <ul className="space-y-2">
                  {payload.linkAnalysis.sharedLinks.map((url, index) => (
                    <li key={index} className="p-2 bg-stone-800 border border-stone-700 rounded text-sm">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 break-all"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Media-Specific Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {payload.linkAnalysis.mediaSpecificLinks.articles.length > 0 && (
                <div>
                  <h6 className="text-xs font-medium text-blue-400 mb-2">Article-Specific Links</h6>
                  <ul className="space-y-1">
                    {payload.linkAnalysis.mediaSpecificLinks.articles.map((url, index) => (
                      <li key={index} className="p-2 bg-blue-900/20 border border-blue-800/30 rounded text-xs">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 break-all"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {payload.linkAnalysis.mediaSpecificLinks.podcasts.length > 0 && (
                <div>
                  <h6 className="text-xs font-medium text-green-400 mb-2">Podcast-Specific Links</h6>
                  <ul className="space-y-1">
                    {payload.linkAnalysis.mediaSpecificLinks.podcasts.map((url, index) => (
                      <li key={index} className="p-2 bg-green-900/20 border border-green-800/30 rounded text-xs">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300 break-all"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

