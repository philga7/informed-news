import { useState } from 'react';
import { Edit2, Save, X, Plus, Target, AlertCircle, Ban } from 'lucide-react';
import type { CollectionPlan } from '../../types/osint';

interface CollectionPlanCardProps {
  topicId: string;
  collectionPlan: CollectionPlan | null;
  onSave: (plan: Partial<CollectionPlan>) => Promise<void>;
}

export function CollectionPlanCard({ topicId, collectionPlan, onSave }: CollectionPlanCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable state
  const [sourceTypesNeeded, setSourceTypesNeeded] = useState<string[]>(
    collectionPlan?.sourceTypesNeeded || []
  );
  const [sourceTypeInput, setSourceTypeInput] = useState('');
  
  const [claimsToVerify, setClaimsToVerify] = useState<string[]>(
    collectionPlan?.claimsToVerify || []
  );
  const [claimInput, setClaimInput] = useState('');
  
  const [coverageGaps, setCoverageGaps] = useState<string[]>(
    collectionPlan?.coverageGaps || []
  );
  const [gapInput, setGapInput] = useState('');
  
  const [sourcesToAvoid, setSourcesToAvoid] = useState<string[]>(
    collectionPlan?.sourcesToAvoid || []
  );
  const [avoidInput, setAvoidInput] = useState('');
  
  const [notes, setNotes] = useState(collectionPlan?.notes || '');

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => {
    // Reset to original values
    setSourceTypesNeeded(collectionPlan?.sourceTypesNeeded || []);
    setClaimsToVerify(collectionPlan?.claimsToVerify || []);
    setCoverageGaps(collectionPlan?.coverageGaps || []);
    setSourcesToAvoid(collectionPlan?.sourcesToAvoid || []);
    setNotes(collectionPlan?.notes || '');
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        topicId,
        sourceTypesNeeded,
        claimsToVerify,
        coverageGaps,
        sourcesToAvoid,
        notes: notes.trim() || null,
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving collection plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to save collection plan');
    } finally {
      setIsSaving(false);
    }
  };

  const addItem = (
    input: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    items: string[],
    inputSetter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const trimmed = input.trim();
    if (trimmed && !items.includes(trimmed)) {
      setter([...items, trimmed]);
      inputSetter('');
    }
  };

  const removeItem = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    items: string[]
  ) => {
    setter(items.filter((_, i) => i !== index));
  };

  const hasContent = collectionPlan && (
    sourceTypesNeeded.length > 0 ||
    claimsToVerify.length > 0 ||
    coverageGaps.length > 0 ||
    sourcesToAvoid.length > 0 ||
    notes
  );

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target size={20} className="text-blue-400" />
          <h3 className="text-xl font-semibold text-stone-200">Collection Plan</h3>
        </div>
        {!isEditing ? (
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
          >
            <Edit2 size={16} />
            {hasContent ? 'Edit' : 'Create Plan'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      {!hasContent && !isEditing ? (
        <div className="text-center py-8 text-stone-500">
          <p className="mb-2">No collection plan defined yet.</p>
          <p className="text-sm">
            Define what evidence types you need, claims to verify, and known gaps.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Source Types Needed */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Source Types Needed
            </label>
            {isEditing ? (
              <>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={sourceTypeInput}
                    onChange={(e) => setSourceTypeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem(sourceTypeInput, setSourceTypesNeeded, sourceTypesNeeded, setSourceTypeInput);
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 text-sm"
                    placeholder="e.g., government, academic, primary source..."
                  />
                  <button
                    type="button"
                    onClick={() => addItem(sourceTypeInput, setSourceTypesNeeded, sourceTypesNeeded, setSourceTypeInput)}
                    className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {sourceTypesNeeded.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sourceTypesNeeded.map((type, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-900/30 text-blue-300 text-sm rounded border border-blue-800 flex items-center gap-1"
                      >
                        {type}
                        <button
                          type="button"
                          onClick={() => removeItem(index, setSourceTypesNeeded, sourceTypesNeeded)}
                          className="hover:text-blue-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : sourceTypesNeeded.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sourceTypesNeeded.map((type, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-blue-900/30 text-blue-300 text-sm rounded border border-blue-800"
                  >
                    {type}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No source types specified</p>
            )}
          </div>

          {/* Claims to Verify */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Claims to Verify
            </label>
            {isEditing ? (
              <>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={claimInput}
                    onChange={(e) => setClaimInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem(claimInput, setClaimsToVerify, claimsToVerify, setClaimInput);
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 text-sm"
                    placeholder="Specific claim needing corroboration..."
                  />
                  <button
                    type="button"
                    onClick={() => addItem(claimInput, setClaimsToVerify, claimsToVerify, setClaimInput)}
                    className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {claimsToVerify.length > 0 && (
                  <div className="space-y-2">
                    {claimsToVerify.map((claim, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 bg-stone-800 rounded border border-stone-700"
                      >
                        <span className="flex-1 text-sm text-stone-300">{claim}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(index, setClaimsToVerify, claimsToVerify)}
                          className="text-stone-500 hover:text-stone-300"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : claimsToVerify.length > 0 ? (
              <ul className="space-y-2">
                {claimsToVerify.map((claim, index) => (
                  <li key={index} className="text-sm text-stone-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>{claim}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">No claims specified</p>
            )}
          </div>

          {/* Coverage Gaps */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-300 mb-2">
              <AlertCircle size={16} className="text-yellow-400" />
              Coverage Gaps
            </label>
            {isEditing ? (
              <>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={gapInput}
                    onChange={(e) => setGapInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem(gapInput, setCoverageGaps, coverageGaps, setGapInput);
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 text-sm"
                    placeholder="Known gap in evidence or coverage..."
                  />
                  <button
                    type="button"
                    onClick={() => addItem(gapInput, setCoverageGaps, coverageGaps, setGapInput)}
                    className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {coverageGaps.length > 0 && (
                  <div className="space-y-2">
                    {coverageGaps.map((gap, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 bg-yellow-900/20 rounded border border-yellow-800/50"
                      >
                        <span className="flex-1 text-sm text-yellow-200">{gap}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(index, setCoverageGaps, coverageGaps)}
                          className="text-yellow-600 hover:text-yellow-400"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : coverageGaps.length > 0 ? (
              <ul className="space-y-2">
                {coverageGaps.map((gap, index) => (
                  <li key={index} className="text-sm text-yellow-200 flex items-start gap-2 p-2 bg-yellow-900/20 rounded border border-yellow-800/50">
                    <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">No gaps identified</p>
            )}
          </div>

          {/* Sources to Avoid */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-300 mb-2">
              <Ban size={16} className="text-red-400" />
              Sources to Avoid
            </label>
            {isEditing ? (
              <>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={avoidInput}
                    onChange={(e) => setAvoidInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem(avoidInput, setSourcesToAvoid, sourcesToAvoid, setAvoidInput);
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 text-sm"
                    placeholder="Source to skip due to bias or noise..."
                  />
                  <button
                    type="button"
                    onClick={() => addItem(avoidInput, setSourcesToAvoid, sourcesToAvoid, setAvoidInput)}
                    className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {sourcesToAvoid.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sourcesToAvoid.map((source, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-red-900/30 text-red-300 text-sm rounded border border-red-800 flex items-center gap-1"
                      >
                        {source}
                        <button
                          type="button"
                          onClick={() => removeItem(index, setSourcesToAvoid, sourcesToAvoid)}
                          className="hover:text-red-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : sourcesToAvoid.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sourcesToAvoid.map((source, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-red-900/30 text-red-300 text-sm rounded border border-red-800"
                  >
                    {source}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No exclusions specified</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Additional Notes
            </label>
            {isEditing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none text-sm"
                placeholder="Additional collection planning notes..."
              />
            ) : notes ? (
              <p className="text-sm text-stone-300 whitespace-pre-wrap">{notes}</p>
            ) : (
              <p className="text-sm text-stone-500">No additional notes</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

