import {
  HISTORY_RESCUE_STORE_ORDER,
  type HistoryRescuePayload,
  type HistoryRescueSections,
  type HistoryRescueStoreName,
} from '../../domain/historyImport/rescue.ts';
import {
  HISTORY_ARCHIVE_SYSTEM_BACKUP_SCHEMA_VERSION,
  type HistoryArchiveSystemBackupManifest,
} from '../../domain/systemBackup/types.ts';
import {
  buildHistoryRescuePayload,
  calculateHistoryRescueManifestChecksum,
  stableHistoryRescueJson,
  validateHistoryRescuePayload,
} from '../historyImport/backup/rescueArchive.ts';
import {
  activateSystemBackupHistoryArchive,
  createHistoryArchiveRestoreDatabaseId,
  deleteHistoryArchiveDatabase,
  getActiveHistoryArchive,
  openHistoryArchiveDatabase,
  readHistoryArchiveSections,
  writeHistoryArchiveSections,
} from '../historyImport/storage/indexedDbArchive.ts';

export interface HistoryArchiveSystemBackupFile {
  path: string;
  json: string;
}

export interface PreparedHistoryArchiveSystemRestore {
  databaseId: string;
  expectedActiveDatabaseId?: string;
  archiveId: string;
  manifestChecksum: string;
  recordCounts: Record<HistoryRescueStoreName, number>;
}

const archiveChunkPath = (chunkId: string): string => `history-archive/${chunkId}.json`;

const backupNonce = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const recordCountsFor = (
  payload: HistoryRescuePayload,
): Record<HistoryRescueStoreName, number> => Object.fromEntries(
  HISTORY_RESCUE_STORE_ORDER.map(store => [store, payload.sections[store].length]),
) as Record<HistoryRescueStoreName, number>;

export const buildHistoryArchiveSystemBackupFiles = async (input: {
  generatedAt?: number;
  sourceDeviceId?: string;
  factory?: IDBFactory;
} = {}): Promise<{
  manifest: HistoryArchiveSystemBackupManifest;
  files: HistoryArchiveSystemBackupFile[];
} | null> => {
  const active = await getActiveHistoryArchive(input.factory);
  if (!active) return null;

  const database = await openHistoryArchiveDatabase(active.activeDatabaseId, input.factory);
  let sections;
  try {
    sections = await readHistoryArchiveSections(database);
  } finally {
    database.close();
  }

  const generatedAt = input.generatedAt ?? Date.now();
  const payload = await buildHistoryRescuePayload({
    archiveId: active.archiveId,
    sourceDeviceId: input.sourceDeviceId || 'aetheros-local-system-backup',
    createdAt: generatedAt,
    sections: sections as unknown as HistoryRescueSections,
  });
  const payloadManifestChecksum = await calculateHistoryRescueManifestChecksum(payload.manifest);
  const files: HistoryArchiveSystemBackupFile[] = [];
  const descriptors: HistoryArchiveSystemBackupManifest['files'] = [];

  payload.manifest.sections.forEach(section => {
    section.chunks.forEach(chunk => {
      const records = payload.sections[section.store].slice(
        chunk.recordStart,
        chunk.recordStart + chunk.recordCount,
      );
      const json = stableHistoryRescueJson(records);
      const path = archiveChunkPath(chunk.chunkId);
      files.push({ path, json });
      descriptors.push({
        path,
        store: section.store,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        recordStart: chunk.recordStart,
        recordCount: chunk.recordCount,
        byteLength: chunk.plaintextBytes,
        sha256: chunk.sha256,
      });
    });
  });

  return {
    manifest: {
      schemaVersion: HISTORY_ARCHIVE_SYSTEM_BACKUP_SCHEMA_VERSION,
      format: 'aetheros-history-source-json-v1',
      sourceActivationRevision: active.revision,
      payloadManifest: payload.manifest,
      payloadManifestChecksum,
      files: descriptors,
      generatedAt,
    },
    files,
  };
};

export const verifyHistoryArchiveSystemBackupFiles = async (input: {
  manifest: HistoryArchiveSystemBackupManifest;
  files: HistoryArchiveSystemBackupFile[];
}): Promise<HistoryRescuePayload> => {
  const { manifest } = input;
  if (
    manifest.schemaVersion !== HISTORY_ARCHIVE_SYSTEM_BACKUP_SCHEMA_VERSION
    || manifest.format !== 'aetheros-history-source-json-v1'
  ) throw new Error('历史源整机备份版本不受支持。');
  if (!Number.isSafeInteger(manifest.sourceActivationRevision) || manifest.sourceActivationRevision < 1) {
    throw new Error('历史源整机备份缺少有效的激活版本。');
  }
  if (new Set(manifest.files.map(file => file.path)).size !== manifest.files.length) {
    throw new Error('历史源整机备份文件路径重复。');
  }

  const expectedChunks = manifest.payloadManifest.sections.flatMap(section => (
    section.chunks.map(chunk => ({ section, chunk }))
  ));
  if (expectedChunks.length !== manifest.files.length) {
    throw new Error('历史源整机备份分块数量不一致。');
  }
  const fileByPath = new Map(input.files.map(file => [file.path, file.json]));
  if (fileByPath.size !== input.files.length) throw new Error('历史源整机备份输入文件重复。');
  const sections = Object.fromEntries(
    HISTORY_RESCUE_STORE_ORDER.map(store => [store, []]),
  ) as unknown as Record<HistoryRescueStoreName, unknown[]>;

  for (const store of HISTORY_RESCUE_STORE_ORDER) {
    const section = manifest.payloadManifest.sections.find(item => item.store === store);
    if (!section) throw new Error(`历史源整机备份缺少 ${store} 清单。`);
    const descriptors = manifest.files
      .filter(file => file.store === store)
      .sort((left, right) => left.chunkIndex - right.chunkIndex);
    if (descriptors.length !== section.chunkCount) throw new Error(`历史源整机备份 ${store} 分块不完整。`);
    let recordStart = 0;
    for (const descriptor of descriptors) {
      const expected = section.chunks[descriptor.chunkIndex];
      if (
        !expected
        || descriptor.path !== archiveChunkPath(expected.chunkId)
        || descriptor.chunkId !== expected.chunkId
        || descriptor.recordStart !== recordStart
        || descriptor.recordStart !== expected.recordStart
        || descriptor.recordCount !== expected.recordCount
        || descriptor.byteLength !== expected.plaintextBytes
        || descriptor.sha256 !== expected.sha256
      ) throw new Error(`历史源整机备份 ${store} 分块清单不一致。`);
      const json = fileByPath.get(descriptor.path);
      if (json === undefined) throw new Error(`历史源整机备份缺少 ${descriptor.path}`);
      if (new TextEncoder().encode(json).byteLength !== descriptor.byteLength) {
        throw new Error(`历史源整机备份 ${descriptor.path} 字节数校验失败。`);
      }
      const records = JSON.parse(json) as unknown;
      if (!Array.isArray(records) || records.length !== descriptor.recordCount) {
        throw new Error(`历史源整机备份 ${descriptor.path} 记录数校验失败。`);
      }
      sections[store].push(...records);
      recordStart += records.length;
    }
    if (recordStart !== section.recordCount) throw new Error(`历史源整机备份 ${store} 总数不一致。`);
  }

  return validateHistoryRescuePayload({
    manifest: manifest.payloadManifest,
    sections,
  }, manifest.payloadManifestChecksum);
};

export const prepareHistoryArchiveSystemRestore = async (input: {
  manifest: HistoryArchiveSystemBackupManifest;
  files: HistoryArchiveSystemBackupFile[];
  factory?: IDBFactory;
}): Promise<PreparedHistoryArchiveSystemRestore> => {
  const payload = await verifyHistoryArchiveSystemBackupFiles(input);
  const active = await getActiveHistoryArchive(input.factory);
  const databaseId = createHistoryArchiveRestoreDatabaseId(
    `${payload.manifest.archiveId}-system-${backupNonce()}`,
  );
  try {
    await writeHistoryArchiveSections({
      databaseId,
      sections: payload.sections,
      factory: input.factory,
    });
    const database = await openHistoryArchiveDatabase(databaseId, input.factory);
    try {
      const observed = await readHistoryArchiveSections(database, { orderingTemplate: payload.sections });
      await validateHistoryRescuePayload({
        manifest: payload.manifest,
        sections: observed,
      }, input.manifest.payloadManifestChecksum);
    } finally {
      database.close();
    }
  } catch (error) {
    await deleteHistoryArchiveDatabase(databaseId, input.factory).catch(() => undefined);
    throw error;
  }
  return {
    databaseId,
    expectedActiveDatabaseId: active?.activeDatabaseId,
    archiveId: payload.manifest.archiveId,
    manifestChecksum: input.manifest.payloadManifestChecksum,
    recordCounts: recordCountsFor(payload),
  };
};

export const activatePreparedHistoryArchiveSystemRestore = async (input: {
  prepared: PreparedHistoryArchiveSystemRestore;
  activatedAt?: number;
  factory?: IDBFactory;
}) => activateSystemBackupHistoryArchive({
  databaseId: input.prepared.databaseId,
  expectedActiveDatabaseId: input.prepared.expectedActiveDatabaseId,
  archiveId: input.prepared.archiveId,
  manifestChecksum: input.prepared.manifestChecksum,
  recordCounts: input.prepared.recordCounts,
  activatedAt: input.activatedAt ?? Date.now(),
  factory: input.factory,
});

export const discardPreparedHistoryArchiveSystemRestore = async (input: {
  prepared: PreparedHistoryArchiveSystemRestore;
  factory?: IDBFactory;
}): Promise<void> => {
  const active = await getActiveHistoryArchive(input.factory);
  if (active?.activeDatabaseId === input.prepared.databaseId) return;
  await deleteHistoryArchiveDatabase(input.prepared.databaseId, input.factory);
};
