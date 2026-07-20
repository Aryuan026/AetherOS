import type {
  HistoryRescueManifest,
  HistoryRescueStoreName,
} from '../historyImport/rescue.ts';

export const HISTORY_ARCHIVE_SYSTEM_BACKUP_SCHEMA_VERSION = 1 as const;

export interface HistoryArchiveSystemBackupFile {
  path: string;
  store: HistoryRescueStoreName;
  chunkId: string;
  chunkIndex: number;
  recordStart: number;
  recordCount: number;
  byteLength: number;
  sha256: string;
}

/**
 * Manifest stored in data.json for a whole-device backup. Raw history rows stay
 * in separate chunk files so a large import is not duplicated inside data.json.
 */
export interface HistoryArchiveSystemBackupManifest {
  schemaVersion: typeof HISTORY_ARCHIVE_SYSTEM_BACKUP_SCHEMA_VERSION;
  format: 'aetheros-history-source-json-v1';
  sourceActivationRevision: number;
  payloadManifest: HistoryRescueManifest;
  payloadManifestChecksum: string;
  files: HistoryArchiveSystemBackupFile[];
  generatedAt: number;
}

