import { useState } from 'react';
import { ArticleCard } from './ArticleCard';
import {
  VerifyThis,
  classificationForVerifyThis,
} from './VerifyThis';
import type { Article } from './types';

type ClusterGroupProps = {
  lead: Article;
  related: Article[];
};

export function ClusterGroup({ lead, related }: ClusterGroupProps) {
  const [open, setOpen] = useState(false);
  const n = related.length;
  const label = n === 1 ? '1 related item' : `${n} related items`;
  const verifyClassification = classificationForVerifyThis(lead, related);

  return (
    <div className="cluster-group">
      <ArticleCard article={lead} hideVerifyThis />
      {verifyClassification ? (
        <VerifyThis classification={verifyClassification} />
      ) : null}
      <button
        type="button"
        className="linkish cluster-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open ? (
        <ul className="cluster-related">
          {related.map((article) => (
            <li key={article.id}>
              <ArticleCard article={article} hideVerifyThis />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
