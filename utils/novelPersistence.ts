import type { NovelBook } from '../types.ts';

export interface NovelUpdateCoordinator {
  update(id: string, updates: Partial<NovelBook>): Promise<NovelBook>;
}

export interface CreateNovelUpdateCoordinatorInput {
  readSnapshot: () => readonly NovelBook[];
  persist: (novel: NovelBook) => Promise<void>;
  commitSnapshot: (novels: NovelBook[]) => void;
  now?: () => number;
}

/**
 * Serializes patches per book. Every queued patch reads the snapshot committed
 * by the previous successful patch, persists its next value, and only then
 * publishes that value to React state. A rejected write leaves state untouched
 * and does not poison later updates in the same queue.
 */
export const createNovelUpdateCoordinator = (
  input: CreateNovelUpdateCoordinatorInput,
): NovelUpdateCoordinator => {
  const queues = new Map<string, Promise<void>>();
  const now = input.now ?? Date.now;

  return {
    update: (rawId, rawUpdates) => {
      const id = rawId.trim();
      if (!id) return Promise.reject(new Error('Novel id must not be empty'));
      const updates = { ...rawUpdates };
      const previous = queues.get(id) ?? Promise.resolve();
      const operation = previous.then(async () => {
        const currentSnapshot = input.readSnapshot();
        const currentIndex = currentSnapshot.findIndex(novel => novel.id === id);
        if (currentIndex < 0) throw new Error(`Novel not found: ${id}`);
        const current = currentSnapshot[currentIndex];
        const timestamp = Math.max(now(), current.lastActiveAt + 1);
        const nextNovel: NovelBook = {
          ...current,
          ...updates,
          id: current.id,
          lastActiveAt: timestamp,
        };

        await input.persist(nextNovel);

        const latestSnapshot = input.readSnapshot();
        const latestIndex = latestSnapshot.findIndex(novel => novel.id === id);
        if (latestIndex < 0) {
          throw new Error(`Novel disappeared before durable update commit: ${id}`);
        }
        const nextSnapshot = [...latestSnapshot];
        nextSnapshot[latestIndex] = nextNovel;
        input.commitSnapshot(nextSnapshot);
        return nextNovel;
      });
      queues.set(id, operation.then(() => undefined, () => undefined));
      return operation;
    },
  };
};
