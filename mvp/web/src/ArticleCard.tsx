import { Fragment, useState, type CSSProperties } from 'react';
import type { Article, BodyStatus, FramingDimensions } from './types';
import { VerifyThis } from './VerifyThis';

const DIMENSION_LABELS: { key: keyof FramingDimensions; label: string }[] = [
  { key: 'loadedLanguage', label: 'Loaded language' },
  { key: 'emotionalAppeal', label: 'Emotional appeal' },
  { key: 'certaintyClaiming', label: 'Certainty claiming' },
  { key: 'omissionOrSelectionRisk', label: 'Omission / selection' },
  { key: 'attributionClarity', label: 'Attribution clarity' },
];

const BODY_EXCERPT_CHARS = 360;

type ArticleCardProps = {
  article: Article;
  /** Cluster shows verify-this once; suppress on member cards. */
  hideVerifyThis?: boolean;
};

function sourceChipLabel(article: Article): string {
  if (article.sourceKind === 'xcancel') {
    return article.handle ? `@${article.handle}` : '@unknown';
  }
  return 'CFP';
}

function titlesDiffer(headline: string, publisherTitle: string | null): boolean {
  if (!publisherTitle?.trim()) return false;
  return headline.trim().toLowerCase() !== publisherTitle.trim().toLowerCase();
}

function truncateExcerpt(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const slice = normalized.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxChars * 0.6 ? lastSpace : maxChars;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

function depthHonesty(article: Article): {
  kind: 'excerpt' | 'unavailable' | 'blocked' | 'pending';
  text: string;
} | null {
  const status: BodyStatus = article.bodyStatus;
  const body = article.bodyText?.trim() || '';

  if ((status === 'ok' || status === 'not_applicable') && body) {
    return { kind: 'excerpt', text: truncateExcerpt(body, BODY_EXCERPT_CHARS) };
  }

  if (article.sourceKind === 'xcancel') {
    // Tweet text should already be body; fall back to snippet if needed.
    const fallback = body || article.snippet.trim();
    if (fallback) {
      return {
        kind: 'excerpt',
        text: truncateExcerpt(fallback, BODY_EXCERPT_CHARS),
      };
    }
    return null;
  }

  if (status === 'blocked') {
    return { kind: 'blocked', text: 'Original text blocked' };
  }
  if (status === 'unavailable' || status === 'pending') {
    return {
      kind: status === 'pending' ? 'pending' : 'unavailable',
      text: 'Original text unavailable',
    };
  }

  return { kind: 'unavailable', text: 'Original text unavailable' };
}

export function ArticleCard({
  article,
  hideVerifyThis = false,
}: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const c = article.classification;
  const chip = sourceChipLabel(article);
  const secondaryMeta =
    article.sourceKind === 'cfp' && article.publisherDomain
      ? article.publisherDomain
      : null;
  const showPublisherTitle = titlesDiffer(article.title, article.publisherTitle);
  const depth = depthHonesty(article);

  return (
    <article className="card">
      <h2 className="card-title">{article.title}</h2>
      {showPublisherTitle ? (
        <p className="publisher-title">
          <span className="publisher-title-label">Publisher</span>
          {article.publisherTitle}
        </p>
      ) : null}
      <p className="card-meta">
        <span className="source-chip">{chip}</span>
        {secondaryMeta ? (
          <>
            <span aria-hidden="true"> · </span>
            <span>{secondaryMeta}</span>
          </>
        ) : null}
        {article.publishedAt ? (
          <>
            <span aria-hidden="true"> · </span>
            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
          </>
        ) : null}
      </p>
      <p className="citations">
        {article.citations.length > 0 ? (
          article.citations.map((cite, index) => (
            <Fragment key={`${cite.label}-${cite.url}`}>
              {index > 0 ? <span aria-hidden="true"> | </span> : null}
              <a href={cite.url} target="_blank" rel="noreferrer">
                {cite.label}
              </a>
            </Fragment>
          ))
        ) : (
          <span className="muted">No citations</span>
        )}
      </p>

      {depth ? (
        depth.kind === 'excerpt' ? (
          <p className="body-excerpt">{depth.text}</p>
        ) : (
          <p className={`depth-status depth-status-${depth.kind}`}>{depth.text}</p>
        )
      ) : null}

      {c ? (
        <>
          <div className="dimension-bars" aria-label="Framing dimensions">
            {DIMENSION_LABELS.map(({ key, label }) => (
              <div key={key} className="dim-row">
                <span className="dim-label">{label}</span>
                <div className="dim-track">
                  <div
                    className="dim-fill"
                    style={
                      {
                        '--dim-pct': `${Math.round(c.dimensions[key] * 100)}%`,
                      } as CSSProperties
                    }
                  />
                </div>
                <span className="dim-value">
                  {Math.round(c.dimensions[key] * 100)}
                </span>
              </div>
            ))}
          </div>
          {!hideVerifyThis ? <VerifyThis classification={c} /> : null}
          <button
            type="button"
            className="linkish"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide framing detail' : 'Show framing detail'}
          </button>
          {expanded && (
            <div className="framing-detail">
              <p className="honesty">
                AI-assisted framing analysis — not ground truth.
              </p>
              <p>
                <strong>Genre:</strong> {c.genre.replace(/_/g, ' ')}
                {' · '}
                <strong>Confidence:</strong> {Math.round(c.confidence * 100)}%
              </p>
              <p>{c.framingSummary}</p>
              {c.headlineDevices.length > 0 && (
                <p>
                  <strong>Headline devices:</strong>{' '}
                  {c.headlineDevices.join(', ')}
                </p>
              )}
              {c.evidenceQuotes.length > 0 && (
                <div>
                  <strong>Evidence</strong>
                  <ul>
                    {c.evidenceQuotes.map((q) => (
                      <li key={q}>
                        <q>{q}</q>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      ) : article.classifyError ? (
        <p className="error muted-error">Classify error: {article.classifyError}</p>
      ) : (
        <p className="muted">Not classified yet</p>
      )}
    </article>
  );
}
