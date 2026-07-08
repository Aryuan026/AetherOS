import type { CharacterProfile, CompanionWakeupRule } from '../types';
import { DB } from './db';
import {
    DEFAULT_DIRECT_LINES,
    createDefaultCareWindowRules,
    createDefaultHeartbeatRules,
    loadCompanionWakeupSettings,
    resolveCompanionWakeupMode,
    scheduleNextCompanionWakeup,
    type CompanionWakeupSettings,
} from './companionWakeups';

const isFuture = (timestamp: number | undefined, now: number): timestamp is number => (
    typeof timestamp === 'number' && timestamp > now
);

export const mergeDefaultHeartbeatRules = (
    char: CharacterProfile,
    existingRules: CompanionWakeupRule[],
    settings: CompanionWakeupSettings = loadCompanionWakeupSettings(),
    now = Date.now(),
): CompanionWakeupRule[] => {
    const mode = resolveCompanionWakeupMode(settings, { lines: DEFAULT_DIRECT_LINES });
    const defaults = createDefaultHeartbeatRules(char, mode);
    const defaultIds = new Set(defaults.map(rule => rule.id));
    const existingById = new Map(existingRules.map(rule => [rule.id, rule]));
    const mergedDefaults = defaults.map(defaultRule => {
        const current = existingById.get(defaultRule.id);
        const base: CompanionWakeupRule = current
            ? {
                ...defaultRule,
                ...current,
                mode,
                lines: mode === 'direct' ? (current.lines?.length ? current.lines : DEFAULT_DIRECT_LINES) : undefined,
                updatedAt: now,
            }
            : {
                ...defaultRule,
                enabled: true,
                updatedAt: now,
            };
        return {
            ...base,
            enabled: true,
            nextTriggerAt: isFuture(base.nextTriggerAt, now)
                ? base.nextTriggerAt
                : scheduleNextCompanionWakeup(base, now),
        };
    });
    const customHeartbeats = existingRules
        .filter(rule => rule.kind === 'heartbeat' && !defaultIds.has(rule.id))
        .map(rule => {
            const nextRule: CompanionWakeupRule = {
                ...rule,
                enabled: true,
                mode,
                lines: mode === 'direct' ? (rule.lines?.length ? rule.lines : DEFAULT_DIRECT_LINES) : undefined,
                updatedAt: now,
            };
            return {
                ...nextRule,
                nextTriggerAt: isFuture(nextRule.nextTriggerAt, now)
                    ? nextRule.nextTriggerAt
                    : scheduleNextCompanionWakeup(nextRule, now),
            };
        });
    return [...mergedDefaults, ...customHeartbeats];
};

export const syncBuiltInCareWakeupRules = async (
    char: CharacterProfile,
    enabled: boolean,
    settings: CompanionWakeupSettings = loadCompanionWakeupSettings(),
    existingRules?: CompanionWakeupRule[],
): Promise<CompanionWakeupRule[]> => {
    const now = Date.now();
    const rules = existingRules || await DB.getCompanionWakeupRulesByCharId(char.id);
    const mode = resolveCompanionWakeupMode(settings, { lines: ['提醒用户照顾自己'] });
    const defaults = createDefaultCareWindowRules(char, mode);
    const existingById = new Map(rules.map(rule => [rule.id, rule]));
    const saved: CompanionWakeupRule[] = [];

    for (const defaultRule of defaults) {
        const current = existingById.get(defaultRule.id);
        const base: CompanionWakeupRule = current
            ? {
                ...defaultRule,
                ...current,
                enabled,
                mode,
                lines: mode === 'direct' ? (current.lines?.length ? current.lines : defaultRule.lines) : undefined,
                updatedAt: now,
            }
            : {
                ...defaultRule,
                enabled,
                updatedAt: now,
            };
        const nextRule = {
            ...base,
            nextTriggerAt: enabled && isFuture(base.nextTriggerAt, now)
                ? base.nextTriggerAt
                : enabled
                    ? scheduleNextCompanionWakeup(base, now)
                    : base.nextTriggerAt,
        };
        await DB.saveCompanionWakeupRule(nextRule);
        saved.push(nextRule);
    }

    return saved;
};

export const syncBuiltInCareForActiveCharacters = async (
    characters: CharacterProfile[],
    enabled: boolean,
    settings: CompanionWakeupSettings = loadCompanionWakeupSettings(),
): Promise<number> => {
    let touched = 0;
    for (const char of characters) {
        const rules = await DB.getCompanionWakeupRulesByCharId(char.id);
        const hasActiveHeartbeat = rules.some(rule => rule.kind === 'heartbeat' && rule.enabled);
        const hasBuiltInCare = rules.some(rule => rule.id.startsWith(`wake-care-built-in-${char.id}-`));
        if (!enabled && !hasBuiltInCare) continue;
        if (enabled && !hasActiveHeartbeat) continue;
        await syncBuiltInCareWakeupRules(char, enabled, settings, rules);
        touched += 1;
    }
    return touched;
};
