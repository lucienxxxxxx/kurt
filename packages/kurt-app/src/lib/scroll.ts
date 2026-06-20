/** Scroll helpers for the thread's conditional bottom-follow. Pure so the
 *  follow/stop decision is unit-testable without a real scroll container. */

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/** Distance (px) from the very bottom of the scroller. */
export function distanceFromBottom(m: ScrollMetrics): number {
  return m.scrollHeight - m.scrollTop - m.clientHeight;
}

/** Within `threshold` px of the bottom → still counts as "at the bottom" (keep
 *  following the latest content). */
export function isNearBottom(m: ScrollMetrics, threshold = 72): boolean {
  return distanceFromBottom(m) <= threshold;
}
