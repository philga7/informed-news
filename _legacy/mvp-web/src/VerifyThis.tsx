import type { FramingAnalysis } from './types';

/** omissionOrSelectionRisk at or above this is surfaced as a plain-language note. */
export const SELECTION_RISK_HIGH = 0.6;

type VerifyThisProps = {
  classification: FramingAnalysis;
};

/**
 * In-feed reading checklist from framing fields.
 * Not a fact-check verdict; no vendor APIs.
 */
export function VerifyThis({ classification }: VerifyThisProps) {
  const questions = classification.openQuestions
    .map((q) => q.trim())
    .filter(Boolean);
  const highSelectionRisk =
    classification.dimensions.omissionOrSelectionRisk >= SELECTION_RISK_HIGH;

  if (questions.length === 0 && !highSelectionRisk) {
    return null;
  }

  return (
    <section className="verify-this" aria-label="Verify this">
      <h3 className="verify-this-heading">Verify this</h3>
      <p className="honesty">
        AI-assisted framing analysis — not ground truth. A reading checklist, not
        a fact-check verdict.
      </p>
      {highSelectionRisk ? (
        <p className="verify-this-selection">
          Selection or omission may be doing rhetorical work here — check what
          was left out or emphasized.
        </p>
      ) : null}
      {questions.length > 0 ? (
        <ul className="verify-this-list">
          {questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Prefer lead classification; else first related that has one. */
export function classificationForVerifyThis(
  lead: { classification: FramingAnalysis | null },
  related: Array<{ classification: FramingAnalysis | null }>,
): FramingAnalysis | null {
  if (lead.classification) return lead.classification;
  for (const item of related) {
    if (item.classification) return item.classification;
  }
  return null;
}
