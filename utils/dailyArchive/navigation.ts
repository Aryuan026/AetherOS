import type { HistoryScope } from '../../domain/historyImport/types.ts';
import { sameEvidenceScope } from '../../domain/interactionEvidence/index.ts';

const DAILY_ARCHIVE_NAVIGATION_KEY = 'aetheros_daily_archive_navigation_v1';

export interface DailyArchiveNavigationTarget {
  scope: HistoryScope;
  dateKey: string;
  sourceEvidenceIds?: string[];
  createdAt: number;
}

export const queueDailyArchiveNavigation = (target: DailyArchiveNavigationTarget): void => {
  sessionStorage.setItem(DAILY_ARCHIVE_NAVIGATION_KEY, JSON.stringify(target));
};
export const consumeDailyArchiveNavigation = (
  scope: HistoryScope,
): DailyArchiveNavigationTarget | undefined => {
  const raw = sessionStorage.getItem(DAILY_ARCHIVE_NAVIGATION_KEY);
  if (!raw) return undefined;
  try {
    const target = JSON.parse(raw) as DailyArchiveNavigationTarget;
    if (
      !target?.scope
      || !sameEvidenceScope(target.scope, scope)
      || !/^\d{4}-\d{2}-\d{2}$/u.test(target.dateKey)
      || !Number.isFinite(target.createdAt)
    ) return undefined;
    sessionStorage.removeItem(DAILY_ARCHIVE_NAVIGATION_KEY);
    return target;
  } catch {
    sessionStorage.removeItem(DAILY_ARCHIVE_NAVIGATION_KEY);
    return undefined;
  }
};
