// Returns a new tours_seen map with `pageKey` marked seen, preserving prior keys.
export function nextToursSeen(prev, pageKey) {
  return { ...(prev || {}), [pageKey]: true };
}
