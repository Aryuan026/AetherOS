import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    HISTORY_IMPORT_STORE_NAMES,
} from '../domain/historyImport/contract.ts';
import {
    HISTORY_RESCUE_STORE_ORDER,
} from '../domain/historyImport/rescue.ts';
import {
    HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS,
    HISTORY_INDEXEDDB_LAB_MAX_PAGE_RECORDS,
    HISTORY_INDEXEDDB_LAB_PREFIX,
    HISTORY_INDEXEDDB_LAB_SCHEMA,
    HISTORY_INDEXEDDB_LAB_SCHEMA_VERSION,
    openHistoryIndexedDbLab,
} from '../utils/historyImport/storage/indexedDbLab.ts';

assert.equal(HISTORY_INDEXEDDB_LAB_SCHEMA_VERSION, 1);
assert.equal(HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS, 500);
assert.equal(HISTORY_INDEXEDDB_LAB_MAX_PAGE_RECORDS, 500);
assert.notEqual(HISTORY_INDEXEDDB_LAB_PREFIX, 'AetherOS_Data');
assert.equal(HISTORY_RESCUE_STORE_ORDER.length, 8);
assert.deepEqual(Object.keys(HISTORY_INDEXEDDB_LAB_SCHEMA), [...HISTORY_RESCUE_STORE_ORDER]);
assert.equal(
    HISTORY_RESCUE_STORE_ORDER.every(store => HISTORY_INDEXEDDB_LAB_SCHEMA[store].keyPath === 'id'),
    true,
    'every lab store must preserve its stable record id as the primary key',
);
assert.deepEqual(
    HISTORY_INDEXEDDB_LAB_SCHEMA[HISTORY_IMPORT_STORE_NAMES.sourceMessages]
        .indexes.find(index => index.name === 'batch_source_order'),
    {
        name: 'batch_source_order',
        keyPath: ['batchId', 'sourceOrder'],
        unique: true,
    },
);
assert.equal(
    HISTORY_INDEXEDDB_LAB_SCHEMA[HISTORY_IMPORT_STORE_NAMES.sourceMessages]
        .indexes.some(index => index.name === 'batch_id'),
    true,
);

await assert.rejects(
    () => openHistoryIndexedDbLab('AetherOS_Data'),
    /must start with AetherOS_HistoryImport_Lab:/,
    'the lab module must reject the production database id before resolving an IDB factory',
);
await assert.rejects(
    () => openHistoryIndexedDbLab(HISTORY_INDEXEDDB_LAB_PREFIX),
    /non-empty suffix/,
);

const implementation = await readFile(
    new URL('../utils/historyImport/storage/indexedDbLab.ts', import.meta.url),
    'utf8',
);
assert.equal(
    /from ['"][^'"]*\/utils\/db(?:\.ts)?['"]/.test(implementation),
    false,
    'the isolated lab must not import the production database adapter',
);
assert.equal(
    implementation.includes('.getAll('),
    false,
    'large-store reads must remain cursor-paged',
);
assert.match(implementation, /transaction\(\[\s*[\s\S]*sourceMessages[\s\S]*jobs/);
assert.match(implementation, /durability: 'strict'/);

console.log(
    `history IndexedDB lab contract OK: stores=${HISTORY_RESCUE_STORE_ORDER.length} chunk<=${HISTORY_INDEXEDDB_LAB_MAX_CHUNK_RECORDS} page<=${HISTORY_INDEXEDDB_LAB_MAX_PAGE_RECORDS}`,
);
