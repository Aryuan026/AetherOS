import { assertEvidenceScope, sameEvidenceScope } from '../interactionEvidence/contract.ts';
import {
    MEMORY_PROJECTION_SCHEMA_VERSION,
    type MemoryProjectionCommand,
    type MemoryProjectionPatch,
    type MemoryProjectionReceipt,
} from './types.ts';

const requiredString = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空。`);
    return value.trim();
};
const scopeToken = (scope: ReturnType<typeof assertEvidenceScope>): string => [
    scope.progressBundleId,
    scope.personaMaskId,
    scope.charId,
].map(encodeURIComponent).join('::');

const patchToken = (patch?: MemoryProjectionPatch): string => encodeURIComponent(JSON.stringify({
    title: patch?.title,
    summary: patch?.summary,
    happenedAt: patch?.happenedAt,
    mood: patch?.mood,
}));

export const createMemoryProjectionCommandId = (input: Omit<MemoryProjectionCommand, 'id'>): string => [
    'memory-projection-command:v1',
    scopeToken(assertEvidenceScope(input.scope)),
    encodeURIComponent(requiredString(input.targetRecordId, 'targetRecordId')),
    encodeURIComponent(requiredString(input.expectedSourceRevisionFingerprint, 'expectedSourceRevisionFingerprint')),
    input.action,
    patchToken(input.patch),
    String(input.requestedAt),
].join(':');

export const createMemoryProjectionReceiptId = (commandId: string): string => (
    `memory-projection-receipt:v1:${encodeURIComponent(requiredString(commandId, 'commandId'))}`
);

export const assertMemoryProjectionPatch = (patch: MemoryProjectionPatch): MemoryProjectionPatch => {
    const keys = Object.keys(patch);
    if (!keys.length || keys.some(key => !['title', 'summary', 'happenedAt', 'mood'].includes(key))) {
        throw new Error('Memory projection patch 不能为空或包含未知字段。');
    }
    if (patch.title !== undefined) requiredString(patch.title, 'patch.title');
    if (patch.summary !== undefined) requiredString(patch.summary, 'patch.summary');
    if (patch.happenedAt !== undefined) {
        requiredString(patch.happenedAt, 'patch.happenedAt');
        if (Number.isNaN(Date.parse(patch.happenedAt))) throw new Error('patch.happenedAt 必须是有效时间。');
    }
    if (patch.mood !== undefined && patch.mood !== null) requiredString(patch.mood, 'patch.mood');
    return patch;
};

export const assertMemoryProjectionCommand = (
    command: MemoryProjectionCommand,
): MemoryProjectionCommand => {
    if (command.schemaVersion !== MEMORY_PROJECTION_SCHEMA_VERSION) throw new Error('MemoryProjectionCommand schemaVersion 无效。');
    assertEvidenceScope(command.scope);
    requiredString(command.id, 'command.id');
    requiredString(command.targetRecordId, 'targetRecordId');
    requiredString(command.expectedSourceRevisionFingerprint, 'expectedSourceRevisionFingerprint');
    if (!['edit', 'hide', 'restore'].includes(command.action)) throw new Error('MemoryProjectionCommand action 无效。');
    if (command.action === 'edit') {
        if (!command.patch) throw new Error('edit MemoryProjectionCommand 缺少 patch。');
        assertMemoryProjectionPatch(command.patch);
    } else if (command.patch) {
        throw new Error('hide/restore MemoryProjectionCommand 不能携带 patch。');
    }
    if (!Number.isFinite(command.requestedAt)) throw new Error('MemoryProjectionCommand requestedAt 无效。');
    if (command.id !== createMemoryProjectionCommandId(command)) throw new Error('MemoryProjectionCommand id 与内容不一致。');
    return command;
};

export const assertMemoryProjectionReceipt = (
    receipt: MemoryProjectionReceipt,
    command?: MemoryProjectionCommand,
): MemoryProjectionReceipt => {
    if (receipt.schemaVersion !== MEMORY_PROJECTION_SCHEMA_VERSION) throw new Error('MemoryProjectionReceipt schemaVersion 无效。');
    assertEvidenceScope(receipt.scope);
    requiredString(receipt.id, 'receipt.id');
    requiredString(receipt.commandId, 'receipt.commandId');
    requiredString(receipt.targetRecordId, 'targetRecordId');
    requiredString(receipt.expectedSourceRevisionFingerprint, 'expectedSourceRevisionFingerprint');
    if (!['edit', 'hide', 'restore'].includes(receipt.action)) throw new Error('MemoryProjectionReceipt action 无效。');
    if (!['applied', 'rejected'].includes(receipt.status)) throw new Error('MemoryProjectionReceipt status 无效。');
    if (receipt.truthEffect !== 'none') throw new Error('MemoryProjectionReceipt 不能改写来源真相。');
    if (receipt.action === 'edit') {
        if (!receipt.patch) throw new Error('edit MemoryProjectionReceipt 缺少 patch。');
        assertMemoryProjectionPatch(receipt.patch);
    } else if (receipt.patch) {
        throw new Error('hide/restore MemoryProjectionReceipt 不能携带 patch。');
    }
    if (receipt.status === 'applied') {
        if (!Number.isSafeInteger(receipt.revision) || (receipt.revision || 0) < 1) {
            throw new Error('applied MemoryProjectionReceipt revision 无效。');
        }
    } else if (receipt.revision !== undefined) {
        throw new Error('rejected MemoryProjectionReceipt 不能声明 revision。');
    }
    if (!Number.isFinite(receipt.createdAt)) throw new Error('MemoryProjectionReceipt createdAt 无效。');
    if (receipt.id !== createMemoryProjectionReceiptId(receipt.commandId)) throw new Error('MemoryProjectionReceipt id 与 commandId 不一致。');
    if (command && (
        receipt.commandId !== command.id
        || receipt.targetRecordId !== command.targetRecordId
        || receipt.expectedSourceRevisionFingerprint !== command.expectedSourceRevisionFingerprint
        || receipt.action !== command.action
        || JSON.stringify(receipt.patch) !== JSON.stringify(command.patch)
        || !sameEvidenceScope(receipt.scope, command.scope)
    )) throw new Error('MemoryProjectionReceipt 与 command 不一致。');
    return receipt;
};
