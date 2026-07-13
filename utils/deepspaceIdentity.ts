import type { UserDeepSpaceIdentityMode, UserProfile } from '../types';

export const DEFAULT_DEEPSPACE_USER_IDENTITY_MODE: UserDeepSpaceIdentityMode = 'custom_non_hunter';

export const DEEPSPACE_USER_CIRCLE_WORLDBOOK_ID = 'builtin-deepspace-user-circle';
export const DEEPSPACE_HUNTER_NPC_WORLDBOOK_ID = 'builtin-deepspace-optional-hunter-npc-index';

const DEEPSPACE_STORY_WORLDBOOK_IDS = new Set([
    'builtin-deepspace-story-xavier',
    'builtin-deepspace-story-zayne',
    'builtin-deepspace-story-qiyu',
    'builtin-deepspace-story-sylus',
    'builtin-deepspace-story-caleb',
]);

export const DEEPSPACE_IDENTITY_MODE_LABELS: Record<UserDeepSpaceIdentityMode, string> = {
    custom_non_hunter: '自设非猎人',
    custom_hunter: '自设猎人',
    canon_hunter: '原作主控 / 灵空猎人',
};

export const DEEPSPACE_IDENTITY_MODE_DESCRIPTIONS: Record<UserDeepSpaceIdentityMode, string> = {
    custom_non_hunter: '不自动成为灵空行动部猎人，也不自动继承原作主控的家人、旧识和以太芯核关系；深空角色仍可作为世界人物出现，并可随剧情进入关系网。',
    custom_hunter: '可以拥有猎人职业和任务入口，但不自动继承张素、夏以昼、黎深旧识等原作主控私关系。',
    canon_hunter: '采用原作主控/灵空行动部猎人身份，可启用主控核心关系和猎人同事网络。',
};

export const resolveDeepSpaceIdentityMode = (user?: Pick<UserProfile, 'deepspaceIdentityMode'>): UserDeepSpaceIdentityMode => (
    user?.deepspaceIdentityMode || DEFAULT_DEEPSPACE_USER_IDENTITY_MODE
);

export const isCanonHunterIdentity = (user?: Pick<UserProfile, 'deepspaceIdentityMode'>) => (
    resolveDeepSpaceIdentityMode(user) === 'canon_hunter'
);

export const isNonHunterIdentity = (user?: Pick<UserProfile, 'deepspaceIdentityMode'>) => (
    resolveDeepSpaceIdentityMode(user) === 'custom_non_hunter'
);

export const buildDeepSpaceIdentityContext = (user: UserProfile): string => {
    const mode = resolveDeepSpaceIdentityMode(user);
    const label = DEEPSPACE_IDENTITY_MODE_LABELS[mode];
    const note = user.deepspaceIdentityNote?.trim();

    let context = `### 互动对象身份优先级 (User Identity Override)\n`;
    context += `本节优先级高于角色卡、世界书和剧情增强资料包中未被用户明确启用的“默认主控/默认猎人/默认宿命关系”。\n`;
    context += `- 名字: ${user.name}\n`;
    context += `- 深空身份模式: ${label}\n`;
    if (note) context += `- 身份补充/职业: ${note}\n`;
    context += `- 设定/备注: ${user.bio || '无'}\n`;

    if (mode === 'canon_hunter') {
        context += `- 允许采用原作主控或灵空行动部猎人身份；只有已启用的资料包才可作为当前关系事实。\n`;
    } else if (mode === 'custom_hunter') {
        context += `- {{user}} 可以是自设猎人或相关行动人员，但不是自动等同于原作主控。\n`;
        context += `- 不要默认 {{user}} 是张素的孙女、夏以昼的妹妹、黎深的童年旧识，除非用户设定、当前聊天或已启用资料包明确建立。\n`;
    } else {
        context += `- {{user}} 不是深空猎人，不默认属于灵空行动部，不默认拥有猎人执照、猎人装备、猎人同事关系或猎人任务权限。\n`;
        context += `- 不要默认 {{user}} 是原作主控、张素的孙女、夏以昼的妹妹、黎深的童年旧识，也不要默认 {{user}} 的心脏/身体与以太芯核或主控重生机制有关。\n`;
        context += `- 深空原作角色与 NPC 仍然可以作为这个世界里真实存在的人出现：医生、艺术家、N109势力、远空舰队、猎人协会、医院同事、路人和新闻人物都可被自然提及。\n`;
        context += `- 这些人物可以随着当前剧情、偶遇、委托、医疗、艺术、地下交易、航天事件或用户主动设定逐步进入 {{user}} 的关系网；但关系需要被当前剧情建立，不能因为原作默认关系直接跳过相识过程。\n`;
    }

    context += `\n`;
    return context;
};

export type DeepSpaceWorldbookIdentityNotice = {
    tone: 'danger' | 'warning' | 'info';
    title: string;
    body: string;
    requiresConfirm?: boolean;
};

export const getDeepSpaceWorldbookIdentityNotice = (
    worldbook: { id?: string; title?: string },
    user?: Pick<UserProfile, 'deepspaceIdentityMode'>
): DeepSpaceWorldbookIdentityNotice | null => {
    const mode = resolveDeepSpaceIdentityMode(user);
    const id = worldbook.id || '';

    if (id === DEEPSPACE_USER_CIRCLE_WORLDBOOK_ID && mode !== 'canon_hunter') {
        return {
            tone: 'danger',
            title: '会覆盖成原作主控关系',
            body: mode === 'custom_non_hunter'
                ? '这本会把 user 写成灵空猎人、张素孙女、夏以昼妹妹和黎深旧识。非猎人自设不建议启用；若确实要混入原作私关系，请再次点击确认。'
                : '这本会继承原作主控家人/旧识关系，不只是猎人职业。自设猎人若不想继承原作私关系，请保持停用。',
            requiresConfirm: true,
        };
    }

    if (id === DEEPSPACE_HUNTER_NPC_WORLDBOOK_ID && mode === 'custom_non_hunter') {
        return {
            tone: 'warning',
            title: '可作世界人物，不自动变同事',
            body: '灵空行动部 NPC 可以作为猎人协会/城市事件中的人物出现，但当前 user 不是猎人时，不应默认他们是 user 的同事、上司或队友。',
        };
    }

    if (DEEPSPACE_STORY_WORLDBOOK_IDS.has(id) && mode !== 'canon_hunter') {
        return {
            tone: 'info',
            title: '剧情增强需按自设身份缓慢接入',
            body: '这类资料包可作为角色私线与世界事件素材，但不要直接覆盖 user 的自设身份；宿命、旧识、家人关系需要由当前剧情或用户设定逐步建立。',
        };
    }

    return null;
};
