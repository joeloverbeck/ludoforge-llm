const CACHE_STAT_PATTERNS = [
  /policyEncodedStateCache[A-Za-z]+=\d+(?:\.\d+)?/gu,
  /previewDriveBatchCount=\d+(?:\.\d+)?/gu,
  /historicalBatchCount=\d+(?:\.\d+)?/gu,
  /[A-Za-z][A-Za-z0-9_]*Cache[A-Za-z0-9_]*=\d+(?:\.\d+)?/gu,
];

export function extractCacheStats(...chunks) {
  const stats = {};
  for (const chunk of chunks) {
    for (const pattern of CACHE_STAT_PATTERNS) {
      for (const match of chunk.matchAll(pattern)) {
        const [key, rawValue] = match[0].split('=');
        stats[key] = Number(rawValue);
      }
    }
  }
  return stats;
}
