import React from 'react';
import useIntersectionObserver from '../hooks/useIntersectionObserver';

/**
 * @param {React.ReactNode} children - The card content to animate
 * @param {number} index - Card index for stagger delay calculation
 * @param {number} staggerDelay - Ms between each card's animation start (default: 80ms)
 * @param {number} duration - Animation duration in ms (default: 600)
 * @param {string} direction - Animation direction: 'up' | 'down' | 'left' | 'right' (default: 'up')
 * @param {number} distance - Translation distance in px (default: 40)
 * @param {string} className - Additional CSS classes
 */
const AnimatedCard = ({
  children,
  index = 0,
  staggerDelay = 80,
  duration = 600,
  direction = 'up',
  distance = 40,
  className = '',
}) => {
  const { ref, isVisible } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '0px 0px -30px 0px',
    triggerOnce: true,
  });

  // Calculate initial transform based on direction
  const directionMap = {
    up: `translateY(${distance}px)`,
    down: `translateY(-${distance}px)`,
    left: `translateX(${distance}px)`,
    right: `translateX(-${distance}px)`,
  };

  const initialTransform = directionMap[direction] || directionMap.up;
  const delay = index * staggerDelay;

  // Inline styles for GPU-accelerated animation.
  // WHY inline vs CSS class: The stagger delay is dynamic (index-based),
  // so we can't pre-define it in CSS. The transform/opacity are also
  // toggled by JS state, making inline the correct pattern here.
  const style = {
    transform: isVisible ? 'translate3d(0, 0, 0)' : initialTransform,
    opacity: isVisible ? 1 : 0,
    transition: `transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, opacity ${duration}ms ease-out ${delay}ms`,
    willChange: isVisible ? 'auto' : 'transform, opacity',
  };

  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
};

export default React.memo(AnimatedCard);
