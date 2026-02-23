const DEFAULT_FAN_GAP = 4;

/**
 * Compute the horizontal offset for an item in a fan layout.
 * Items are evenly spaced and centered around x=0.
 */
export function computeFanOffset(
  index: number,
  total: number,
  itemWidth: number,
  gap: number = DEFAULT_FAN_GAP,
): { x: number; y: number } {
  const spacing = itemWidth + gap;
  const totalWidth = (total - 1) * spacing;
  return {
    x: index * spacing - totalWidth / 2,
    y: 0,
  };
}
