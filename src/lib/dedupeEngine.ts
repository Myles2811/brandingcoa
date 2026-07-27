import { NormalizedNotice, PSAwardResult } from './types';
import { realAwardKey } from './awardIdentity';

export function deduplicateNotices(notices: NormalizedNotice[]): NormalizedNotice[] {
  const seen = new Set<string>();
  const result: NormalizedNotice[] = [];

  for (const notice of notices) {
    const key = realAwardKey(notice);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(notice);
    }
  }
  return result;
}

export function deduplicateResults(results: PSAwardResult[]): PSAwardResult[] {
  const seen = new Set<string>();
  const deduped: PSAwardResult[] = [];

  for (const result of results) {
    const key = realAwardKey(result);

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(result);
    }
  }
  return deduped;
}
