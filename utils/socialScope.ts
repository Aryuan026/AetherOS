import type {
    SocialPost,
    SocialRelationshipScope,
    UserProfile,
} from '../types.ts';
import { normalizeUserPersonaProfile } from './userPersonaMasks.ts';

const nonEmptyString = (value: unknown): value is string => (
    typeof value === 'string' && value.trim().length > 0
);

export const normalizeSocialRelationshipScope = (
    value: unknown,
): SocialRelationshipScope | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<SocialRelationshipScope>;
    if (!nonEmptyString(candidate.progressBundleId) || !nonEmptyString(candidate.personaMaskId)) {
        return undefined;
    }
    return {
        progressBundleId: candidate.progressBundleId,
        personaMaskId: candidate.personaMaskId,
    };
};

const listValidSocialScopes = (
    profile: UserProfile,
): Array<SocialRelationshipScope & { linkedCharacterIds: string[] }> => {
    const normalized = normalizeUserPersonaProfile(profile);
    const bundles = new Map((normalized.progressBundles || []).map(bundle => [bundle.id, bundle]));
    return (normalized.personaMasks || []).flatMap(mask => {
        const bundle = bundles.get(mask.progressBundleId);
        if (!bundle || bundle.maskId !== mask.id) return [];
        return [{
            progressBundleId: bundle.id,
            personaMaskId: mask.id,
            linkedCharacterIds: [...new Set((mask.linkedCharacterIds || []).filter(Boolean))],
        }];
    });
};

export const activeSocialRelationshipScope = (
    profile: UserProfile,
): SocialRelationshipScope | undefined => {
    const normalized = normalizeUserPersonaProfile(profile);
    const activeMaskId = normalized.activePersonaMaskId;
    const activeBundleId = normalized.activeProgressBundleId;
    const activeScope = listValidSocialScopes(normalized).find(scope => (
        scope.personaMaskId === activeMaskId
        && scope.progressBundleId === activeBundleId
    ));
    return activeScope ? {
        progressBundleId: activeScope.progressBundleId,
        personaMaskId: activeScope.personaMaskId,
    } : undefined;
};

export const socialScopesMatch = (
    left: unknown,
    right: unknown,
): boolean => {
    const normalizedLeft = normalizeSocialRelationshipScope(left);
    const normalizedRight = normalizeSocialRelationshipScope(right);
    return Boolean(
        normalizedLeft
        && normalizedRight
        && normalizedLeft.progressBundleId === normalizedRight.progressBundleId
        && normalizedLeft.personaMaskId === normalizedRight.personaMaskId
    );
};

export const socialPostMatchesScope = (
    post: Pick<SocialPost, 'socialScope'>,
    scope: SocialRelationshipScope | undefined,
): boolean => Boolean(scope && socialScopesMatch(post.socialScope, scope));

/**
 * Old Social rows had no mask scope. We only attach them when their ownership is
 * unambiguous: either the profile has one valid mask, or every referenced
 * character resolves to exactly one mask. Ambiguous rows remain stored but do
 * not leak into whichever mask happens to be active.
 */
export const inferLegacySocialPostScope = (
    post: Pick<SocialPost, 'socialScope' | 'charId' | 'comments' | 'replyAudienceCharIds' | 'replyRemainingCharIds' | 'evidenceAudienceCharIds'>,
    profile: UserProfile,
): SocialRelationshipScope | undefined => {
    const existing = normalizeSocialRelationshipScope(post.socialScope);
    if (existing) return existing;

    const scopes = listValidSocialScopes(profile);
    if (scopes.length === 1) {
        return {
            progressBundleId: scopes[0].progressBundleId,
            personaMaskId: scopes[0].personaMaskId,
        };
    }

    const referencedIds = [...new Set([
        post.charId || '',
        ...(post.comments || []).map(comment => comment.charId || ''),
        ...(post.replyAudienceCharIds || []),
        ...(post.replyRemainingCharIds || []),
        ...(post.evidenceAudienceCharIds || []),
    ].filter(Boolean))];
    if (referencedIds.length === 0) return undefined;

    const candidates = scopes.filter(scope => (
        referencedIds.every(charId => scope.linkedCharacterIds.includes(charId))
    ));
    if (candidates.length !== 1) return undefined;
    return {
        progressBundleId: candidates[0].progressBundleId,
        personaMaskId: candidates[0].personaMaskId,
    };
};
