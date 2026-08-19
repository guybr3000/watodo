import React, { useState } from 'react';
import { StarIcon } from './Icons';

export interface StarRatingProps {
  value?: number | null;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
  showLabel?: boolean;
  showScoreBadge?: boolean;
  className?: string;
  allowClear?: boolean;
}

const RATING_LABELS: Record<number, string> = {
  1: '1 Star • Needs Attention',
  2: '2 Stars • Fair',
  3: '3 Stars • Good',
  4: '4 Stars • Very Good',
  5: '5 Stars • Excellent'
};

export const StarRating: React.FC<StarRatingProps> = ({
  value = 0,
  onChange,
  readOnly = false,
  size = 16,
  showLabel = false,
  showScoreBadge = false,
  className = '',
  allowClear = true
}) => {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const currentScore = hoverRating !== null ? hoverRating : (value || 0);
  const isInteractive = !readOnly && Boolean(onChange);

  const handleClick = (e: React.MouseEvent, starIndex: number) => {
    e.stopPropagation();
    if (!isInteractive || !onChange) return;

    if (allowClear && value === starIndex) {
      onChange(0);
    } else {
      onChange(starIndex);
    }
  };

  return (
    <div
      className={`star-rating-container ${isInteractive ? 'interactive' : 'readonly'} ${className}`}
      onMouseLeave={() => isInteractive && setHoverRating(null)}
      onClick={e => e.stopPropagation()}
    >
      <div className="star-rating-stars" role={isInteractive ? 'radiogroup' : undefined}>
        {[1, 2, 3, 4, 5].map(starIndex => {
          const isFilled = starIndex <= currentScore;
          const isHovered = hoverRating !== null && starIndex <= hoverRating;

          return (
            <button
              key={starIndex}
              type="button"
              className={`star-btn ${isFilled ? 'filled' : 'empty'} ${isHovered ? 'hovered' : ''}`}
              onClick={e => handleClick(e, starIndex)}
              onMouseEnter={() => isInteractive && setHoverRating(starIndex)}
              disabled={!isInteractive}
              tabIndex={isInteractive ? 0 : -1}
              title={RATING_LABELS[starIndex] || `${starIndex} Stars`}
              aria-label={`${starIndex} Star rating`}
            >
              <StarIcon
                size={size}
                filled={isFilled}
                className={`star-svg ${isFilled ? 'star-svg-filled' : 'star-svg-empty'}`}
              />
            </button>
          );
        })}
      </div>

      {showScoreBadge && value !== null && value !== undefined && value > 0 && (
        <span className="star-score-badge">
          {value}/5
        </span>
      )}

      {showLabel && currentScore > 0 && (
        <span className="star-rating-label">
          {RATING_LABELS[currentScore]}
        </span>
      )}
    </div>
  );
};
