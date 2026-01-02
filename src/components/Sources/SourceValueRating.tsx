/**
 * Source Value Rating Component
 * 
 * Star rating (1-5) for source usefulness feedback.
 */

import { useState } from 'react';
import { Star } from 'lucide-react';
import { osintSourcesService } from '../../services';

interface SourceValueRatingProps {
  sourceId: string;
  sourceName: string;
  currentRating: number | null;
  onRatingChange?: (newRating: number) => void;
}

export function SourceValueRating({
  sourceId,
  sourceName,
  currentRating,
  onRatingChange,
}: SourceValueRatingProps) {
  const [rating, setRating] = useState<number | null>(currentRating);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleRatingClick = async (newRating: number) => {
    try {
      setIsUpdating(true);
      // Update source with new value_rating
      await osintSourcesService.update(sourceId, { value_rating: newRating } as any);
      setRating(newRating);
      onRatingChange?.(newRating);
    } catch (err) {
      console.error('Error updating source rating:', err);
      alert('Failed to update rating. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderStar = (starIndex: number) => {
    const isActive = hoverRating !== null ? starIndex <= hoverRating : rating !== null && starIndex <= rating;

    return (
      <button
        key={starIndex}
        onClick={() => !isUpdating && handleRatingClick(starIndex)}
        onMouseEnter={() => !isUpdating && setHoverRating(starIndex)}
        onMouseLeave={() => !isUpdating && setHoverRating(null)}
        disabled={isUpdating}
        className={`transition-colors duration-150 ${
          isUpdating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-110'
        }`}
        title={`Rate ${sourceName}: ${starIndex} star${starIndex > 1 ? 's' : ''}`}
      >
        <Star
          size={18}
          className={isActive ? 'fill-yellow-500 text-yellow-500' : 'text-stone-600'}
        />
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((starIndex) => renderStar(starIndex))}
      {rating !== null && (
        <span className="ml-2 text-xs text-stone-500">
          ({rating}/5)
        </span>
      )}
    </div>
  );
}

