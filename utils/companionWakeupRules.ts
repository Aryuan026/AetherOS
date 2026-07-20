import type { CharacterProfile, CompanionWakeupRule, MessageRelationshipScope } from '../types';
import { DB } from './db';
import {
    DEFAULT_CARE_WINDOWS,
    DEFAULT_DIRECT_LINES,
    DEFAULT_HEARTBEAT_WINDOWS,
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

const normalizeRuleTextKey = (value: string): string => (
    String(value || '')
        .replace(/[，。！？、,.!?；;：:\s"'“”‘’（）()【】\[\]-]/g, '')
        .toLowerCase()
        .trim()
);

const careKindFromText = (value: string): 'lunch' | 'dinner' | 'sleep' | '' => {
    if (/午饭|午餐|中饭/.test(value)) return 'lunch';
    if (/晚饭|晚餐/.test(value)) return 'dinner';
    if (/睡前|睡觉|休息|洗漱/.test(value)) return 'sleep';
    return '';
};

const builtInCareRulePrefix = (charId: string): string => `wake-care-built-in-${charId}-`;

export const isBuiltInCareRule = (char: CharacterProfile, rule: CompanionWakeupRule): boolean => (
    rule.kind === 'window' && rule.id.startsWith(builtInCareRulePrefix(char.id))
);

const builtInCareTemplateKey = (rule: CompanionWakeupRule): string => {
    if (rule.kind !== 'window' || rule.repeat !== 'daily' || rule.targetDate) return '';
    const title = normalizeRuleTextKey(rule.title);
    const value = normalizeRuleTextKey(rule.value || '');
    const body = `${title}${value}`;
    const matched = DEFAULT_CARE_WINDOWS.find(template => {
        if (rule.windowStart !== template.windowStart || rule.windowEnd !== template.windowEnd) return false;
        const templateTitle = normalizeRuleTextKey(template.title);
        const templateValue = normalizeRuleTextKey(template.value);
        const exactMatch = title === templateTitle
            || value === templateValue
            || body.includes(templateTitle)
            || body.includes(templateValue);
        const reminderMatch = title.includes('提醒')
            && careKindFromText(body) !== ''
            && careKindFromText(body) === careKindFromText(`${templateTitle}${templateValue}`);
        return title === templateTitle
            || exactMatch
            || reminderMatch;
    });
    return matched
        ? `${rule.charId}:${matched.title}:${matched.windowStart}-${matched.windowEnd}`
        : '';
};

export const isDuplicateBuiltInCareRule = (
    char: CharacterProfile,
    rule: CompanionWakeupRule,
    rules: CompanionWakeupRule[],
): boolean => {
    if (!rule.enabled || isBuiltInCareRule(char, rule)) return false;
    const key = builtInCareTemplateKey(rule);
    if (!key) return false;
    return rules.some(candidate => (
        candidate.enabled
        && candidate.id !== rule.id
        && isBuiltInCareRule(char, candidate)
        && builtInCareTemplateKey(candidate) === key
    ));
};

const wakeupScopeSuffix = (scope?: MessageRelationshipScope): string => scope
    ? [scope.progressBundleId, scope.personaMaskId].map(encodeURIComponent).join('-')
    : 'unscoped';

export const defaultHeartbeatRuleIdsForChar = (
    charId: string,
    relationshipScope?: MessageRelationshipScope,
): Set<string> => (
    new Set(DEFAULT_HEARTBEAT_WINDOWS.map((_, index) => (
        `wake-heartbeat-${charId}-${index + 1}-${wakeupScopeSuffix(relationshipScope)}`
    )))
);

export const isObsoleteHeartbeatRule = (char: CharacterProfile, rule: CompanionWakeupRule): boolean => (
    rule.kind === 'heartbeat'
    && !defaultHeartbeatRuleIdsForChar(char.id, rule.relationshipScope).has(rule.id)
    && rule.source !== 'user'
);

export const mergeDefaultHeartbeatRules = (
    char: CharacterProfile,
    existingRules: CompanionWakeupRule[],
    settings: CompanionWakeupSettings = loadCompanionWakeupSettings(),
    now = Date.now(),
    relationshipScope?: MessageRelationshipScope,
): CompanionWakeupRule[] => {
    const mode = resolveCompanionWakeupMode(settings, { lines: DEFAULT_DIRECT_LINES });
    const defaults = createDefaultHeartbeatRules(char, mode, relationshipScope);
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
        .filter(rule => rule.kind === 'heartbeat' && !defaultIds.has(rule.id) && rule.source === 'user')
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
    relationshipScope?: MessageRelationshipScope,
): Promise<CompanionWakeupRule[]> => {
    const now = Date.now();
    const rules = existingRules || await DB.getCompanionWakeupRulesByCharId(char.id);
    const mode = resolveCompanionWakeupMode(settings, { lines: ['提醒用户照顾自己'] });
    const defaults = createDefaultCareWindowRules(char, mode, relationshipScope);
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

    const activeRules = [
        ...rules,
        ...saved,
    ];
    for (const rule of activeRules) {
        if (isDuplicateBuiltInCareRule(char, rule, activeRules)) {
            await DB.saveCompanionWakeupRule({
                ...rule,
                enabled: false,
                updatedAt: now,
            });
        }
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
        const byScope = new Map<string, CompanionWakeupRule[]>();
        rules.forEach(rule => {
            const scope = rule.relationshipScope;
            if (!scope) return;
            const key = [scope.progressBundleId, scope.personaMaskId, scope.charId].join('\u0000');
            const group = byScope.get(key) || [];
            group.push(rule);
            byScope.set(key, group);
        });
        for (const scopedRules of byScope.values()) {
            const relationshipScope = scopedRules[0]?.relationshipScope;
            const hasActiveHeartbeat = scopedRules.some(rule => rule.kind === 'heartbeat' && rule.enabled);
            const hasBuiltInCare = scopedRules.some(rule => rule.id.startsWith(`wake-care-built-in-${char.id}-`));
            if (!enabled && !hasBuiltInCare) continue;
            if (enabled && !hasActiveHeartbeat) continue;
            await syncBuiltInCareWakeupRules(char, enabled, settings, scopedRules, relationshipScope);
            touched += 1;
        }
    }
    return touched;
};
