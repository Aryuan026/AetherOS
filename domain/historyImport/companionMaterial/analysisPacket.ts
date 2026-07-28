import {
  createHistoryScopeKey,
  validateHistoryScope,
} from '../contract.ts';
import type { DailyArchiveDocument } from '../../dailyArchive/types.ts';
import type { HistoryScope } from '../types.ts';
import type { HistorySourceSpan } from '../analysis/types.ts';

export const HISTORY_COMPANION_ANALYSIS_PACKET_SCHEMA_VERSION = 2 as const;
export const HISTORY_COMPANION_ANALYSIS_PACKET_SET_SCHEMA_VERSION = 2 as const;

export type HistoryCompanionAnalysisLane =
  | 'language_fingerprint'
  | 'stable_detail'
  | 'opening_proactive'
  | 'scene_texture';

export interface HistoryCompanionAnalysisSourceDocument {
  documentId: string;
  documentRevision: number;
}

export interface HistoryCompanionAnalysisEvidence {
  id: string;
  scope: HistoryScope;
  sourceGroupId: string;
  sourceRef: HistorySourceSpan;
  authorChannel: 'user' | 'character';
  /** Private, bounded analysis input. It must never be copied into material records or prompt receipts. */
  ephemeralText: string;
  contentFingerprint: string;
  excerptStart: number;
  excerptEnd: number;
}

export interface HistoryCompanionAnalysisPacketSetManifest {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_PACKET_SET_SCHEMA_VERSION;
  /** SHA-256 over the canonical scope, source revision, lanes and ordered evidence digest. */
  packetSetId: string;
  packetCount: number;
  /** SHA-256 over every evidence authority descriptor in canonical packet order. */
  orderedEvidenceDigest: string;
  /** Every input archive document, including documents that yield no eligible text evidence. */
  sourceDocuments: readonly HistoryCompanionAnalysisSourceDocument[];
  canonicalLaneSet: readonly HistoryCompanionAnalysisLane[];
}

/**
 * An in-memory request packet for a private analyzer. It is deliberately not a
 * companion-material record and must be discarded after a reviewed,
 * non-verbatim result is stored.
 */
export interface HistoryCompanionAnalysisPacket {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_PACKET_SCHEMA_VERSION;
  id: string;
  packetOrdinal: number;
  packetSet: HistoryCompanionAnalysisPacketSetManifest;
  /** SHA-256 over this packet's ordered evidence authority descriptors. */
  packetEvidenceDigest: string;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  requestedLanes: readonly HistoryCompanionAnalysisLane[];
  evidence: readonly HistoryCompanionAnalysisEvidence[];
  sourceGroupIds: readonly string[];
  sourceDocumentIds: readonly string[];
  rawRetention: 'ephemeral_not_persisted';
  /** Unicode code-point budget, so an emoji is never split into invalid UTF-16 halves. */
  maxPacketChars: number;
  inputChars: number;
  createdAt: number;
}

export interface HistoryCompanionAnalysisPacketDescriptor {
  schemaVersion: typeof HISTORY_COMPANION_ANALYSIS_PACKET_SCHEMA_VERSION;
  id: string;
  packetOrdinal: number;
  packetSetId: string;
  packetCount: number;
  packetEvidenceDigest: string;
  orderedEvidenceDigest: string;
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  requestedLanes: readonly HistoryCompanionAnalysisLane[];
  evidenceIds: readonly string[];
  contentFingerprints: readonly string[];
  sourceGroupIds: readonly string[];
  /** Full source manifest for freshness checks; may include documents with no eligible evidence. */
  sourceDocuments: readonly HistoryCompanionAnalysisSourceDocument[];
  sourceDocumentIds: readonly string[];
  inputChars: number;
  createdAt: number;
}

export interface HistoryCompanionAnalysisEvidenceLaneGrant {
  packetSetId: string;
  packetId: string;
  evidenceId: string;
  allowedLanes: readonly HistoryCompanionAnalysisLane[];
}

export interface HistoryCompanionAnalysisEvidenceLaneUse {
  evidenceId: string;
  lane: HistoryCompanionAnalysisLane;
}

export interface BuildHistoryCompanionAnalysisPacketsInput {
  scope: HistoryScope;
  documents: readonly DailyArchiveDocument[];
  requestedLanes?: readonly HistoryCompanionAnalysisLane[];
  maxPacketChars?: number;
  maxEvidenceChars?: number;
  maxEvidenceItems?: number;
  createdAt?: number;
}

const ALL_LANES: readonly HistoryCompanionAnalysisLane[] = [
  'language_fingerprint',
  'stable_detail',
  'opening_proactive',
  'scene_texture',
];

const isNonEmpty = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

export const historyCompanionUnicodeLength = (value: string): number => [...value].length;

const sliceByUnicodeChars = (
  value: string,
  excerptStart: number,
  maxChars: number,
): { excerptEnd: number; text: string } => {
  const remainder = value.slice(excerptStart);
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity: 'grapheme' },
      ) => {
        segment(input: string): Iterable<{ segment: string; index: number }>;
      };
    }
  ).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
    let excerptEnd = excerptStart;
    let chars = 0;
    for (const part of segmenter.segment(remainder)) {
      const partChars = historyCompanionUnicodeLength(part.segment);
      if (chars > 0 && chars + partChars > maxChars) break;
      if (chars === 0 && partChars > maxChars) break;
      chars += partChars;
      excerptEnd = excerptStart + part.index + part.segment.length;
    }
    if (excerptEnd > excerptStart) {
      return {
        excerptEnd,
        text: value.slice(excerptStart, excerptEnd),
      };
    }
  }

  let excerptEnd = excerptStart;
  let chars = 0;
  while (excerptEnd < value.length && chars < maxChars) {
    const codePoint = value.codePointAt(excerptEnd);
    if (codePoint === undefined) break;
    excerptEnd += codePoint > 0xFFFF ? 2 : 1;
    chars += 1;
  }
  return {
    excerptEnd,
    text: value.slice(excerptStart, excerptEnd),
  };
};

const canonicalize = (value: unknown, seen: WeakSet<object>): string => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical authority data must use finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('canonical authority data must not be circular');
    seen.add(value);
    const serialized = `[${value.map(item => (
      item === undefined ? 'null' : canonicalize(item, seen)
    )).join(',')}]`;
    seen.delete(value);
    return serialized;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('canonical authority data must not be circular');
    seen.add(value);
    const record = value as Record<string, unknown>;
    const serialized = `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`)
      .join(',')}}`;
    seen.delete(value);
    return serialized;
  }
  throw new Error(`unsupported canonical authority value: ${typeof value}`);
};

export const canonicalHistoryCompanionAuthorityJson = (value: unknown): string => (
  canonicalize(value, new WeakSet())
);

const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value: number, shift: number): number => (
  (value >>> shift) | (value << (32 - shift))
);

/**
 * Synchronous, dependency-free SHA-256 for browser and Node packet planning.
 * Web Crypto remains preferable for large persisted blobs; these bounded
 * authority envelopes stay synchronous so existing local planners need no
 * Node-only import and no async compatibility fork.
 */
export const sha256HistoryCompanionAuthority = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 1 + 8) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  return Array.from(state, word => word.toString(16).padStart(8, '0')).join('');
};

const authorityFingerprint = (value: unknown): string => (
  `sha256:${sha256HistoryCompanionAuthority(canonicalHistoryCompanionAuthorityJson(value))}`
);

export interface HistoryCompanionSourceDocumentHead {
  documentId: string;
  revision: number;
  messageCount: number;
  contentDigest: string;
}

/**
 * Canonical source authority shared by packet construction and the later
 * current-head freshness check. Callers never provide this fingerprint.
 */
export const historyCompanionSourceRevisionFingerprintFromDocuments = (input: {
  scope: HistoryScope;
  documents: readonly DailyArchiveDocument[];
}): {
  sourceRevisionFingerprint: string;
  sourceDocumentHeads: HistoryCompanionSourceDocumentHead[];
} => {
  const sourceDocumentHeads = [...input.documents]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(document => ({
      documentId: document.id,
      revision: document.revision,
      messageCount: document.messageCount,
      contentDigest: authorityFingerprint(document.messages.map(message => ({
        id: message.id,
        revision: message.revision,
        status: message.status,
        role: message.role,
        kind: message.kind,
        content: message.content,
      }))),
    }));
  return {
    sourceRevisionFingerprint: authorityFingerprint({
      scope: canonicalScope(input.scope),
      sourceDocumentHeads,
    }),
    sourceDocumentHeads,
  };
};

const canonicalScope = (scope: HistoryScope): HistoryScope => ({
  progressBundleId: scope.progressBundleId,
  personaMaskId: scope.personaMaskId,
  charId: scope.charId,
});

const canonicalLanes = (
  lanes: readonly HistoryCompanionAnalysisLane[],
): HistoryCompanionAnalysisLane[] => {
  const laneSet = new Set(lanes);
  return ALL_LANES.filter(lane => laneSet.has(lane));
};

const evidenceAuthorityDescriptor = (
  evidence: Pick<
    HistoryCompanionAnalysisEvidence,
    | 'scope'
    | 'sourceGroupId'
    | 'sourceRef'
    | 'authorChannel'
    | 'contentFingerprint'
    | 'excerptStart'
    | 'excerptEnd'
  >,
) => ({
  scope: canonicalScope(evidence.scope),
  sourceGroupId: evidence.sourceGroupId,
  sourceRef: {
    documentId: evidence.sourceRef.documentId,
    documentRevision: evidence.sourceRef.documentRevision,
    dateKey: evidence.sourceRef.dateKey,
    startMessageOffset: evidence.sourceRef.startMessageOffset,
    endMessageOffset: evidence.sourceRef.endMessageOffset,
    messageIds: [...(evidence.sourceRef.messageIds || [])],
  },
  authorChannel: evidence.authorChannel,
  contentFingerprint: evidence.contentFingerprint,
  excerptStart: evidence.excerptStart,
  excerptEnd: evidence.excerptEnd,
});

const evidenceFingerprint = (
  evidence: Pick<
    HistoryCompanionAnalysisEvidence,
    | 'scope'
    | 'sourceGroupId'
    | 'sourceRef'
    | 'authorChannel'
    | 'ephemeralText'
    | 'excerptStart'
    | 'excerptEnd'
  >,
): string => authorityFingerprint({
  scope: canonicalScope(evidence.scope),
  sourceGroupId: evidence.sourceGroupId,
  sourceRef: {
    documentId: evidence.sourceRef.documentId,
    documentRevision: evidence.sourceRef.documentRevision,
    dateKey: evidence.sourceRef.dateKey,
    startMessageOffset: evidence.sourceRef.startMessageOffset,
    endMessageOffset: evidence.sourceRef.endMessageOffset,
    messageIds: [...(evidence.sourceRef.messageIds || [])],
  },
  authorChannel: evidence.authorChannel,
  excerptStart: evidence.excerptStart,
  excerptEnd: evidence.excerptEnd,
  ephemeralText: evidence.ephemeralText,
});

const evidenceId = (
  sourceGroupId: string,
  contentFingerprint: string,
): string => `history-evidence-${sha256HistoryCompanionAuthority(
  canonicalHistoryCompanionAuthorityJson({ sourceGroupId, contentFingerprint }),
)}`;

const packetId = (input: {
  packetSetId: string;
  packetOrdinal: number;
  packetEvidenceDigest: string;
}): string => `history-companion-analysis-${sha256HistoryCompanionAuthority(
  canonicalHistoryCompanionAuthorityJson(input),
)}`;

const evidenceDigest = (
  evidence: readonly HistoryCompanionAnalysisEvidence[],
): string => authorityFingerprint(evidence.map(evidenceAuthorityDescriptor));

const packetSetId = (input: {
  scope: HistoryScope;
  sourceRevisionFingerprint: string;
  packetCount: number;
  orderedEvidenceDigest: string;
  sourceDocuments: readonly HistoryCompanionAnalysisSourceDocument[];
  canonicalLaneSet: readonly HistoryCompanionAnalysisLane[];
}): string => `history-companion-analysis-set-${sha256HistoryCompanionAuthority(
  canonicalHistoryCompanionAuthorityJson({
    scope: canonicalScope(input.scope),
    sourceRevisionFingerprint: input.sourceRevisionFingerprint,
    packetCount: input.packetCount,
    orderedEvidenceDigest: input.orderedEvidenceDigest,
    sourceDocuments: input.sourceDocuments,
    canonicalLaneSet: input.canonicalLaneSet,
  }),
)}`;

const sameScope = (left: HistoryScope, right: HistoryScope): boolean => (
  createHistoryScopeKey(left) === createHistoryScopeKey(right)
);

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
};

const evidenceSlices = (input: {
  scope: HistoryScope;
  document: DailyArchiveDocument;
  maxEvidenceChars: number;
}): HistoryCompanionAnalysisEvidence[] => input.document.messages.flatMap((message, messageOffset) => {
  if (!sameScope(message.scope, input.scope)) {
    throw new Error(
      `Daily archive message ${message.id} crosses analysis scope in document ${input.document.id}`,
    );
  }
  if (
    message.status !== 'active'
    || message.kind !== 'text'
    || (message.role !== 'user' && message.role !== 'character')
    || (message.manualEntry !== undefined && message.manualEntry.status !== 'confirmed')
    || !message.content.trim()
  ) return [];

  const sourceGroupId = `${input.document.id}@${input.document.revision}`;
  const sourceRef: HistorySourceSpan = {
    documentId: input.document.id,
    documentRevision: input.document.revision,
    dateKey: input.document.dateKey,
    startMessageOffset: messageOffset,
    endMessageOffset: messageOffset + 1,
    messageIds: [message.id],
  };
  const slices: HistoryCompanionAnalysisEvidence[] = [];
  for (let excerptStart = 0; excerptStart < message.content.length;) {
    const {
      excerptEnd,
      text: ephemeralText,
    } = sliceByUnicodeChars(message.content, excerptStart, input.maxEvidenceChars);
    const evidenceWithoutIdentity = {
      scope: { ...message.scope },
      sourceGroupId,
      sourceRef,
      authorChannel: message.role,
      ephemeralText,
      excerptStart,
      excerptEnd,
    };
    const contentFingerprint = evidenceFingerprint(evidenceWithoutIdentity);
    slices.push({
      ...evidenceWithoutIdentity,
      id: evidenceId(sourceGroupId, contentFingerprint),
      contentFingerprint,
    });
    excerptStart = excerptEnd;
  }
  return slices;
});

export const validateHistoryCompanionAnalysisPacket = (
  packet: HistoryCompanionAnalysisPacket,
): string[] => {
  const errors = validateHistoryScope(packet.scope);
  if (packet.schemaVersion !== HISTORY_COMPANION_ANALYSIS_PACKET_SCHEMA_VERSION) {
    errors.push('unsupported history companion analysis packet schemaVersion');
  }
  if (!isNonEmpty(packet.id)) errors.push('analysis packet id is required');
  if (!Number.isInteger(packet.packetOrdinal) || packet.packetOrdinal < 0) {
    errors.push('analysis packet packetOrdinal must be a non-negative integer');
  }
  if (!packet.packetSet || typeof packet.packetSet !== 'object') {
    errors.push('analysis packet packetSet manifest is required');
  } else {
    if (
      packet.packetSet.schemaVersion
      !== HISTORY_COMPANION_ANALYSIS_PACKET_SET_SCHEMA_VERSION
    ) {
      errors.push('unsupported analysis packet set schemaVersion');
    }
    if (!/^history-companion-analysis-set-[a-f0-9]{64}$/u.test(packet.packetSet.packetSetId)) {
      errors.push('analysis packet packetSetId must use canonical SHA-256');
    }
    if (!Number.isInteger(packet.packetSet.packetCount) || packet.packetSet.packetCount < 1) {
      errors.push('analysis packet packetCount must be a positive integer');
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(packet.packetSet.orderedEvidenceDigest)) {
      errors.push('analysis packet orderedEvidenceDigest must use canonical SHA-256');
    }
    const sourceDocuments = Array.isArray(packet.packetSet.sourceDocuments)
      ? packet.packetSet.sourceDocuments
      : [];
    if (!sourceDocuments.length) {
      errors.push('analysis packet packetSet requires canonical source documents');
    } else {
      const documentIds = new Set<string>();
      sourceDocuments.forEach((document, index) => {
        if (!isNonEmpty(document.documentId)) {
          errors.push(`analysis packet packetSet sourceDocuments[${index}].documentId is required`);
        }
        if (!Number.isInteger(document.documentRevision) || document.documentRevision < 1) {
          errors.push(
            `analysis packet packetSet sourceDocuments[${index}].documentRevision must be positive`,
          );
        }
        if (documentIds.has(document.documentId)) {
          errors.push('analysis packet packetSet source document ids must be unique');
        }
        documentIds.add(document.documentId);
      });
      if (
        canonicalHistoryCompanionAuthorityJson(sourceDocuments)
        !== canonicalHistoryCompanionAuthorityJson(
          [...sourceDocuments].sort((left, right) => left.documentId.localeCompare(right.documentId)),
        )
      ) {
        errors.push('analysis packet packetSet source documents must use canonical id order');
      }
    }
    if (
      !packet.packetSet.canonicalLaneSet.length
      || !unique(packet.packetSet.canonicalLaneSet)
      || packet.packetSet.canonicalLaneSet.some(lane => !ALL_LANES.includes(lane))
    ) {
      errors.push('analysis packet canonicalLaneSet must use the supported unique vocabulary');
    } else if (
      JSON.stringify(packet.packetSet.canonicalLaneSet)
      !== JSON.stringify(canonicalLanes(packet.packetSet.canonicalLaneSet))
    ) {
      errors.push('analysis packet canonicalLaneSet is not in canonical order');
    }
    if (
      packet.packetSet.packetCount > 0
      && packet.packetOrdinal >= packet.packetSet.packetCount
    ) {
      errors.push('analysis packet packetOrdinal exceeds packetCount');
    }
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(packet.packetEvidenceDigest)) {
    errors.push('analysis packet packetEvidenceDigest must use canonical SHA-256');
  }
  if (!isNonEmpty(packet.sourceRevisionFingerprint)) {
    errors.push('analysis packet sourceRevisionFingerprint is required');
  }
  if (packet.rawRetention !== 'ephemeral_not_persisted') {
    errors.push('analysis packet rawRetention must remain ephemeral_not_persisted');
  }
  if (!packet.requestedLanes.length || !unique(packet.requestedLanes)) {
    errors.push('analysis packet requestedLanes must be a non-empty unique list');
  }
  if (packet.requestedLanes.some(lane => !ALL_LANES.includes(lane))) {
    errors.push('analysis packet requestedLanes contains an unsupported lane');
  }
  if (
    packet.packetSet
    && JSON.stringify(packet.requestedLanes)
      !== JSON.stringify(packet.packetSet.canonicalLaneSet)
  ) {
    errors.push('analysis packet requestedLanes do not match canonicalLaneSet');
  }
  if (!packet.evidence.length) errors.push('analysis packet requires evidence');
  if (!unique(packet.evidence.map(item => item.id))) {
    errors.push('analysis packet evidence ids must be unique');
  }
  if (!unique(packet.evidence.map(item => item.contentFingerprint))) {
    errors.push('analysis packet evidence content fingerprints must be unique');
  }
  if (!Number.isInteger(packet.maxPacketChars) || packet.maxPacketChars < 1) {
    errors.push('analysis packet maxPacketChars must be a positive integer');
  }
  const actualChars = packet.evidence.reduce(
    (sum, item) => sum + historyCompanionUnicodeLength(item.ephemeralText),
    0,
  );
  if (packet.inputChars !== actualChars) errors.push('analysis packet inputChars does not match evidence');
  if (actualChars > packet.maxPacketChars) errors.push('analysis packet exceeds maxPacketChars');
  if (!Number.isFinite(packet.createdAt)) errors.push('analysis packet createdAt must be finite');
  packet.evidence.forEach((item, index) => {
    if (!sameScope(item.scope, packet.scope)) errors.push(`evidence[${index}] crosses packet scope`);
    if (!isNonEmpty(item.sourceGroupId)) errors.push(`evidence[${index}].sourceGroupId is required`);
    if (!isNonEmpty(item.ephemeralText)) errors.push(`evidence[${index}].ephemeralText is required`);
    if (!isNonEmpty(item.contentFingerprint)) {
      errors.push(`evidence[${index}].contentFingerprint is required`);
    }
    const expectedSourceGroupId = `${item.sourceRef.documentId}@${item.sourceRef.documentRevision}`;
    if (item.sourceGroupId !== expectedSourceGroupId) {
      errors.push(`evidence[${index}].sourceGroupId does not match sourceRef`);
    }
    const expectedFingerprint = evidenceFingerprint(item);
    if (item.contentFingerprint !== expectedFingerprint) {
      errors.push(`evidence[${index}].contentFingerprint does not match evidence content`);
    }
    if (item.id !== evidenceId(item.sourceGroupId, expectedFingerprint)) {
      errors.push(`evidence[${index}].id does not match evidence content`);
    }
    if (
      !Number.isInteger(item.excerptStart)
      || !Number.isInteger(item.excerptEnd)
      || item.excerptStart < 0
      || item.excerptEnd <= item.excerptStart
    ) {
      errors.push(`evidence[${index}] excerpt range is invalid`);
    }
  });
  const expectedGroupIds = [...new Set(packet.evidence.map(item => item.sourceGroupId))].sort();
  if (JSON.stringify(packet.sourceGroupIds) !== JSON.stringify(expectedGroupIds)) {
    errors.push('analysis packet sourceGroupIds do not match evidence');
  }
  const expectedDocumentIds = [...new Set(packet.evidence.map(item => item.sourceRef.documentId))].sort();
  if (JSON.stringify(packet.sourceDocumentIds) !== JSON.stringify(expectedDocumentIds)) {
    errors.push('analysis packet sourceDocumentIds do not match evidence');
  }
  if (
    packet.evidence.length
    && Number.isInteger(packet.packetOrdinal)
    && packet.packetOrdinal >= 0
    && packet.packetSet
  ) {
    const expectedPacketEvidenceDigest = evidenceDigest(packet.evidence);
    if (packet.packetEvidenceDigest !== expectedPacketEvidenceDigest) {
      errors.push('analysis packet packetEvidenceDigest does not match packet evidence');
    }
    const expectedPacketSetId = packetSetId({
      scope: packet.scope,
      sourceRevisionFingerprint: packet.sourceRevisionFingerprint,
      packetCount: packet.packetSet.packetCount,
      orderedEvidenceDigest: packet.packetSet.orderedEvidenceDigest,
      sourceDocuments: packet.packetSet.sourceDocuments,
      canonicalLaneSet: packet.packetSet.canonicalLaneSet,
    });
    if (packet.packetSet.packetSetId !== expectedPacketSetId) {
      errors.push('analysis packet packetSetId does not match canonical manifest');
    }
    if (packet.id !== packetId({
      packetSetId: packet.packetSet.packetSetId,
      packetOrdinal: packet.packetOrdinal,
      packetEvidenceDigest: packet.packetEvidenceDigest,
    })) {
      errors.push('analysis packet id does not match packet evidence');
    }
  }
  return errors;
};

/**
 * Validates the complete authority envelope. A single packet can prove its own
 * content and manifest calculation, while only the complete set can prove that
 * no packet, ordinal or ordered evidence item was omitted or mixed in.
 */
export const validateHistoryCompanionAnalysisPacketSet = (
  packets: readonly HistoryCompanionAnalysisPacket[],
): string[] => {
  if (!packets.length) return ['analysis packet set requires packets'];
  const errors = packets.flatMap((packet, index) => (
    validateHistoryCompanionAnalysisPacket(packet)
      .map(error => `packet[${index}]: ${error}`)
  ));
  const [first] = packets;
  const manifest = first.packetSet;
  if (!manifest) return errors;
  if (packets.length !== manifest.packetCount) {
    errors.push('analysis packet set packetCount does not match supplied packets');
  }
  const packetSetIds = packets.map(packet => packet.packetSet?.packetSetId);
  if (packetSetIds.some(id => id !== manifest.packetSetId)) {
    errors.push('analysis packet set mixes packetSetId values');
  }
  if (packets.some(packet => !sameScope(packet.scope, first.scope))) {
    errors.push('analysis packet set packets cross scope');
  }
  if (packets.some(packet => (
    packet.sourceRevisionFingerprint !== first.sourceRevisionFingerprint
  ))) {
    errors.push('analysis packet set crosses source revision');
  }
  if (!unique(packets.map(packet => packet.id))) {
    errors.push('analysis packet set packet ids must be unique');
  }
  if (!unique(packets.map(packet => String(packet.packetOrdinal)))) {
    errors.push('analysis packet set packet ordinals must be unique');
  }
  packets.forEach((packet, index) => {
    if (packet.packetOrdinal !== index) {
      errors.push('analysis packet set ordinals must be ordered and contiguous from zero');
    }
  });
  const allEvidence = packets.flatMap(packet => packet.evidence);
  if (!unique(allEvidence.map(item => item.id))) {
    errors.push('analysis packet set evidence ids must be globally unique');
  }
  const expectedOrderedEvidenceDigest = evidenceDigest(allEvidence);
  if (manifest.orderedEvidenceDigest !== expectedOrderedEvidenceDigest) {
    errors.push('analysis packet set orderedEvidenceDigest does not match supplied evidence');
  }
  if (packets.some(packet => (
    JSON.stringify(packet.packetSet?.canonicalLaneSet)
    !== JSON.stringify(manifest.canonicalLaneSet)
  ))) {
    errors.push('analysis packet set mixes canonical lane sets');
  }
  if (packets.some(packet => (
    canonicalHistoryCompanionAuthorityJson(packet.packetSet?.sourceDocuments)
    !== canonicalHistoryCompanionAuthorityJson(manifest.sourceDocuments)
  ))) {
    errors.push('analysis packet set mixes canonical source document manifests');
  }
  return errors;
};

export const getHistoryCompanionAnalysisEvidenceLaneGrant = (
  packet: HistoryCompanionAnalysisPacket,
  evidenceIdValue: string,
): HistoryCompanionAnalysisEvidenceLaneGrant => {
  const errors = validateHistoryCompanionAnalysisPacket(packet);
  if (errors.length) throw new Error(`Invalid analysis packet ${packet.id}: ${errors.join('; ')}`);
  if (!packet.evidence.some(item => item.id === evidenceIdValue)) {
    throw new Error(`Evidence ${evidenceIdValue} does not belong to packet ${packet.id}`);
  }
  return {
    packetSetId: packet.packetSet.packetSetId,
    packetId: packet.id,
    evidenceId: evidenceIdValue,
    allowedLanes: [...packet.requestedLanes],
  };
};

/**
 * Review/finalization code should run this against every finding attribution.
 * It keeps lane authority code-owned even though the model can see several
 * analysis lanes in one bounded request.
 */
export const validateHistoryCompanionAnalysisEvidenceLaneUses = (
  packets: readonly HistoryCompanionAnalysisPacket[],
  uses: readonly HistoryCompanionAnalysisEvidenceLaneUse[],
): string[] => {
  const errors = validateHistoryCompanionAnalysisPacketSet(packets);
  if (errors.length) return errors;
  const grants = new Map<string, HistoryCompanionAnalysisEvidenceLaneGrant>();
  packets.forEach(packet => {
    packet.evidence.forEach(item => {
      grants.set(
        item.id,
        getHistoryCompanionAnalysisEvidenceLaneGrant(packet, item.id),
      );
    });
  });
  uses.forEach((use, index) => {
    const grant = grants.get(use.evidenceId);
    if (!grant) {
      errors.push(`evidence lane use[${index}] references evidence outside the packet set`);
      return;
    }
    if (!grant.allowedLanes.includes(use.lane)) {
      errors.push(
        `evidence lane use[${index}] lane ${use.lane} is not allowed by packet ${grant.packetId}`,
      );
    }
  });
  return errors;
};

export const buildHistoryCompanionAnalysisPackets = (
  input: BuildHistoryCompanionAnalysisPacketsInput,
): HistoryCompanionAnalysisPacket[] => {
  const scopeErrors = validateHistoryScope(input.scope);
  if (scopeErrors.length) throw new Error(`Invalid analysis scope: ${scopeErrors.join('; ')}`);
  const maxPacketChars = input.maxPacketChars ?? 12_000;
  const maxEvidenceChars = input.maxEvidenceChars ?? 2_400;
  const maxEvidenceItems = input.maxEvidenceItems ?? 48;
  assertPositiveInteger(maxPacketChars, 'maxPacketChars');
  assertPositiveInteger(maxEvidenceChars, 'maxEvidenceChars');
  assertPositiveInteger(maxEvidenceItems, 'maxEvidenceItems');
  if (maxEvidenceChars > maxPacketChars) {
    throw new Error('maxEvidenceChars must not exceed maxPacketChars');
  }
  const inputLanes = [...(input.requestedLanes?.length ? input.requestedLanes : ALL_LANES)];
  if (!unique(inputLanes) || inputLanes.some(lane => !ALL_LANES.includes(lane))) {
    throw new Error('requestedLanes must use the supported unique lane vocabulary');
  }
  const requestedLanes = canonicalLanes(inputLanes);
  input.documents.forEach(document => {
    if (!sameScope(document.scope, input.scope)) {
      throw new Error(`Daily archive document ${document.id} crosses analysis scope`);
    }
    document.messages.forEach(message => {
      if (!sameScope(message.scope, input.scope)) {
        throw new Error(
          `Daily archive message ${message.id} crosses analysis scope in document ${document.id}`,
        );
      }
    });
  });
  const { sourceRevisionFingerprint } = historyCompanionSourceRevisionFingerprintFromDocuments({
    scope: input.scope,
    documents: input.documents,
  });

  const evidence = [...input.documents]
    .sort((left, right) => {
      const leftKey = String(left.dateKey || left.undatedKey || left.id);
      const rightKey = String(right.dateKey || right.undatedKey || right.id);
      return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
    })
    .flatMap(document => evidenceSlices({
      scope: input.scope,
      document,
      maxEvidenceChars,
    }));
  if (!evidence.length) return [];

  const chunks: HistoryCompanionAnalysisEvidence[][] = [];
  let current: HistoryCompanionAnalysisEvidence[] = [];
  let currentChars = 0;
  for (const item of evidence) {
    const wouldOverflow = (
      current.length >= maxEvidenceItems
      || currentChars + historyCompanionUnicodeLength(item.ephemeralText) > maxPacketChars
    );
    if (current.length && wouldOverflow) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += historyCompanionUnicodeLength(item.ephemeralText);
  }
  if (current.length) chunks.push(current);

  const createdAt = input.createdAt ?? Date.now();
  const orderedEvidenceDigest = evidenceDigest(chunks.flat());
  const sourceDocuments = [...input.documents]
    .map(document => ({
      documentId: document.id,
      documentRevision: document.revision,
    }))
    .sort((left, right) => left.documentId.localeCompare(right.documentId));
  if (!unique(sourceDocuments.map(document => document.documentId))) {
    throw new Error('Daily archive input document ids must be unique');
  }
  const packetSet: HistoryCompanionAnalysisPacketSetManifest = {
    schemaVersion: HISTORY_COMPANION_ANALYSIS_PACKET_SET_SCHEMA_VERSION,
    packetSetId: packetSetId({
      scope: input.scope,
      sourceRevisionFingerprint,
      packetCount: chunks.length,
      orderedEvidenceDigest,
      sourceDocuments,
      canonicalLaneSet: requestedLanes,
    }),
    packetCount: chunks.length,
    orderedEvidenceDigest,
    sourceDocuments,
    canonicalLaneSet: requestedLanes,
  };
  const packets = chunks.map((items, index) => {
    const packetEvidenceDigest = evidenceDigest(items);
    const packet: HistoryCompanionAnalysisPacket = {
      schemaVersion: HISTORY_COMPANION_ANALYSIS_PACKET_SCHEMA_VERSION,
      id: packetId({
        packetSetId: packetSet.packetSetId,
        packetOrdinal: index,
        packetEvidenceDigest,
      }),
      packetOrdinal: index,
      packetSet: {
        ...packetSet,
        sourceDocuments: packetSet.sourceDocuments.map(document => ({ ...document })),
        canonicalLaneSet: [...packetSet.canonicalLaneSet],
      },
      packetEvidenceDigest,
      scope: { ...input.scope },
      sourceRevisionFingerprint,
      requestedLanes,
      evidence: items,
      sourceGroupIds: [...new Set(items.map(item => item.sourceGroupId))].sort(),
      sourceDocumentIds: [...new Set(items.map(item => item.sourceRef.documentId))].sort(),
      rawRetention: 'ephemeral_not_persisted',
      maxPacketChars,
      inputChars: items.reduce(
        (sum, item) => sum + historyCompanionUnicodeLength(item.ephemeralText),
        0,
      ),
      createdAt,
    };
    const errors = validateHistoryCompanionAnalysisPacket(packet);
    if (errors.length) throw new Error(`Invalid generated analysis packet: ${errors.join('; ')}`);
    return packet;
  });
  const setErrors = validateHistoryCompanionAnalysisPacketSet(packets);
  if (setErrors.length) {
    throw new Error(`Invalid generated analysis packet set: ${setErrors.join('; ')}`);
  }
  return packets;
};

/**
 * Safe to retain with a review result. Raw evidence text and source locators
 * stay exclusively in the ephemeral packet.
 */
export const describeHistoryCompanionAnalysisPacket = (
  packet: HistoryCompanionAnalysisPacket,
): HistoryCompanionAnalysisPacketDescriptor => {
  const errors = validateHistoryCompanionAnalysisPacket(packet);
  if (errors.length) throw new Error(`Invalid analysis packet ${packet.id}: ${errors.join('; ')}`);
  return {
    schemaVersion: packet.schemaVersion,
    id: packet.id,
    packetOrdinal: packet.packetOrdinal,
    packetSetId: packet.packetSet.packetSetId,
    packetCount: packet.packetSet.packetCount,
    packetEvidenceDigest: packet.packetEvidenceDigest,
    orderedEvidenceDigest: packet.packetSet.orderedEvidenceDigest,
    scope: { ...packet.scope },
    sourceRevisionFingerprint: packet.sourceRevisionFingerprint,
    requestedLanes: [...packet.requestedLanes],
    evidenceIds: packet.evidence.map(item => item.id),
    contentFingerprints: packet.evidence.map(item => item.contentFingerprint),
    sourceGroupIds: [...packet.sourceGroupIds],
    sourceDocuments: packet.packetSet.sourceDocuments.map(document => ({ ...document })),
    sourceDocumentIds: [...packet.sourceDocumentIds],
    inputChars: packet.inputChars,
    createdAt: packet.createdAt,
  };
};
