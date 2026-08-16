import { Fragment, useState, type CSSProperties } from 'react';
import type { Article, FramingDimensions } from './types';

const DIMENSION_LABELS: { key: keyof FramingDimensions; label: string }[] = [
  { key: 'loadedLanguage', label: 'Loaded language' },
  { key: 'emotionalAppeal', label: 'Emotional appeal' },
  { key: 'certaintyClaiming', label: 'Certainty claiming' },
  { key: 'omissionOrSelectionRisk', label: 'Omission / selection' },
  { key: 'attributionClarity', label: 'Attribution clarity' },
];

type ArticleCardProps = {
  article: Article;
};

function sourceChipLabel(article: Article): string {
  if (article.sourceKind === 'xcancel') {
    return article.handle ? `@${article.handle}` : '@unknown';
  }
  return 'CFP';
}

export function ArticleCard({ article }: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const c = article.classification;
  const chip = sourceChipLabel(article);
  const secondaryMeta =
    article.sourceKind === 'cfp' && article.publisherDomain
      ? article.publisherDomain
      : null;

  return (
    <article className="card">
      <h2 className="card-title">{article.title}</h2>
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
              {c.openQuestions.length > 0 && (
                <div>
                  <strong>Open questions</strong>
                  <ul>
                    {c.openQuestions.map((q) => (
                      <li key={q}>{q}</li>
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
