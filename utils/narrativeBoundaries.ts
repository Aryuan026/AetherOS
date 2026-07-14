import { AppID } from '../types';
import type {
    NarrativeDirective,
    NarrativeLane,
    NarrativeMemoryPolicy,
    NarrativeSurfaceId,
} from '../types';

export interface NarrativeSurfaceBoundary {
    id: NarrativeSurfaceId;
    appId?: AppID;
    label: string;
    currentRole: string;
    recommendedLane: NarrativeLane;
    memoryPolicy: NarrativeMemoryPolicy;
    canReadRelationshipMemory: boolean;
    canEmitDirective: boolean;
    canReceiveDirective: boolean;
    usableForPlotPipeline: 'ready' | 'partial' | 'hold';
    notes: string[];
    risks: string[];
}

type NarrativeDreamTone = NonNullable<NarrativeDirective['dreamDelivery']>['tone'];

export const NARRATIVE_SURFACE_BOUNDARIES: Record<NarrativeSurfaceId, NarrativeSurfaceBoundary> = {
    consult_desk: {
        id: 'consult_desk',
        label: '咨询台',
        currentRole: '规划中的剧情种子孵化器：把用户认可的新剧情扩张整理成待激活指令。',
        recommendedLane: 'pending_mainline',
        memoryPolicy: 'manual_promotion',
        canReadRelationshipMemory: true,
        canEmitDirective: true,
        canReceiveDirective: false,
        usableForPlotPipeline: 'partial',
        notes: [
            '建议作为新 App 或 Novel 的前置子页实现，而不是复用“查手机”。',
            '输出物应该是剧情指令，不是角色已知事实；只有用户采纳后才进入待激活队列。',
        ],
        risks: [
            '若复用查手机，会把剧情设计稿伪装成角色手机证据，污染角色生活事实。',
        ],
    },
    novel: {
        id: 'novel',
        appId: AppID.Novel,
        label: '剧情推演 / 小说生成',
        currentRole: '当前是小说共写器，可续写正文、评论、分析；尚未提供正式的待激活剧情队列 UI。',
        recommendedLane: 'mainline',
        memoryPolicy: 'manual_promotion',
        canReadRelationshipMemory: true,
        canEmitDirective: false,
        canReceiveDirective: true,
        usableForPlotPipeline: 'partial',
        notes: [
            '适合作为主线、约会后存档、咨询台采纳指令的落点。',
            '主线背景录入后，应优先进入 NovelBook.worldSetting 或待激活指令，而不是直接写进角色记忆。',
        ],
        risks: [
            '当前 NovelBook.segments 只是创作文本；不能天然代表已经游玩或已经发生。',
        ],
    },
    date: {
        id: 'date',
        appId: AppID.Date,
        label: '见面',
        currentRole: '低烈度的面对面日常/轻剧情约会，已经接入 meet_scene/date_scene 世界线记忆递送。',
        recommendedLane: 'date_experience',
        memoryPolicy: 'relationship_echo',
        canReadRelationshipMemory: true,
        canEmitDirective: true,
        canReceiveDirective: true,
        usableForPlotPipeline: 'ready',
        notes: [
            '适合承载“今天见一面”的日常体验：吃饭、散步、探望、轻角色扮演。',
            '重剧情、长时间线和主线压力应拆到未来“世界旅行 / 剧情推演”入口。',
            '游玩结束后应产出摘要或存档卡，再由用户决定是否提升为主线事实。',
        ],
        risks: [
            '如果把见面当主线 DM，会破坏“悠哉日常”的入口预期。',
            '如果每条 date 消息都直接当主线事实，会把试戏、重开、擦边 IF 混进主仓。',
        ],
    },
    guidebook: {
        id: 'guidebook',
        appId: AppID.Guidebook,
        label: '攻略本',
        currentRole: '角色攻略用户的反向 galgame，用来生成角色对 user 的理解与攻略经验。',
        recommendedLane: 'user_insight',
        memoryPolicy: 'character_private',
        canReadRelationshipMemory: true,
        canEmitDirective: false,
        canReceiveDirective: false,
        usableForPlotPipeline: 'partial',
        notes: [
            '适合沉淀“角色更懂 user 了”的私有洞察。',
            '可以影响角色态度和互动手感，但不应自动改写世界剧情。',
        ],
        risks: [
            '把攻略本分数或选项当世界事实，会让角色像在读游戏面板而不是在生活。',
        ],
    },
    special_moments: {
        id: 'special_moments',
        appId: AppID.SpecialMoments,
        label: '特别时光',
        currentRole: '由日历/时光簿/纪念节点触发的特殊事件胶囊，保存为 specialMomentRecords，也可能写入带事件 metadata 的聊天卡。',
        recommendedLane: 'keepsake_event',
        memoryPolicy: 'local_keepsake',
        canReadRelationshipMemory: true,
        canEmitDirective: true,
        canReceiveDirective: false,
        usableForPlotPipeline: 'partial',
        notes: [
            '适合做生日、节日、第一次见面、纪念日、收藏地点/故事偏好派生的小约会。',
            '未来应由角色主动发起，并读取日历、时光簿、收藏地点和偏好生成活动规划。',
            '只有用户明确采纳时，才应转成主线经历或未来剧情钩子。',
        ],
        risks: [
            '季节活动通常有重温/重生成路径；自动进主线会让重开内容互相打架。',
        ],
    },
    check_phone: {
        id: 'check_phone',
        appId: AppID.CheckPhone,
        label: '查手机',
        currentRole: '生成角色手机里的聊天、通话、购物、外卖、社交等证据片段。',
        recommendedLane: 'supporting_evidence',
        memoryPolicy: 'system_trace',
        canReadRelationshipMemory: true,
        canEmitDirective: false,
        canReceiveDirective: false,
        usableForPlotPipeline: 'hold',
        notes: [
            '适合补充角色生活质感和可疑线索。',
            '不适合作为咨询台，因为它的产物会被用户理解为角色手机中已经存在的证据。',
        ],
        risks: [
            '当前生成记录会写入 system message；若承载剧情设计稿，容易污染后续 prompt。',
        ],
    },
    game: {
        id: 'game',
        appId: AppID.Game,
        label: 'TRPG',
        currentRole: '独立跑团冒险，可生成日志、状态、行动选项，并在归档时写入角色记忆。',
        recommendedLane: 'sandbox',
        memoryPolicy: 'manual_promotion',
        canReadRelationshipMemory: true,
        canEmitDirective: true,
        canReceiveDirective: true,
        usableForPlotPipeline: 'hold',
        notes: [
            '可借鉴行动日志、选项、掷骰与归档摘要结构。',
            '若未来承接 IF 线，必须先给归档路径加梦境/IF 标签。',
        ],
        risks: [
            '现有归档会直接写 char.memories；不适合作为 IF 线原样复用。',
        ],
    },
    lifesim: {
        id: 'lifesim',
        appId: AppID.LifeSim,
        label: '都市人生',
        currentRole: '都市 NPC 沙盒，让角色参与/搅动城市居民关系和事件。',
        recommendedLane: 'sandbox',
        memoryPolicy: 'excluded_from_main_vault',
        canReadRelationshipMemory: false,
        canEmitDirective: false,
        canReceiveDirective: false,
        usableForPlotPipeline: 'hold',
        notes: [
            '可借鉴“主线编剧室”和 NPC 事件 feed 的想法。',
            '更适合作为旁支沙盒，不适合作为固定背景主线推进器。',
        ],
        risks: [
            '它的世界模型、NPC 生态和离线推进都太独立，直接接主线会让角色体验感分叉。',
        ],
    },
    timebook: {
        id: 'timebook',
        appId: AppID.Schedule,
        label: '时光簿',
        currentRole: '关系纪念物与共同日期表面。',
        recommendedLane: 'keepsake_event',
        memoryPolicy: 'local_keepsake',
        canReadRelationshipMemory: true,
        canEmitDirective: false,
        canReceiveDirective: false,
        usableForPlotPipeline: 'ready',
        notes: [
            '适合保存“已经确认值得记住”的关系节点。',
            '它不是任务板，也不是剧情草稿箱。',
        ],
        risks: [
            '把未游玩的剧情指令塞进时光簿，会让角色误以为已经发生。',
        ],
    },
    chat: {
        id: 'chat',
        appId: AppID.Chat,
        label: '单人聊天',
        currentRole: '角色日常对话入口，是关系状态最敏感的主表面。',
        recommendedLane: 'mainline',
        memoryPolicy: 'main_vault',
        canReadRelationshipMemory: true,
        canEmitDirective: true,
        canReceiveDirective: false,
        usableForPlotPipeline: 'ready',
        notes: [
            '可自然承接见面、电话、时光簿和主线体验后的余温。',
            '不应直接吞下未确认 IF 线作为事实。',
        ],
        risks: [
            '聊天上下文最容易被后续所有入口读取，未确认内容需要明确 metadata。',
        ],
    },
    social_feed: {
        id: 'social_feed',
        appId: AppID.Social,
        label: '朋友圈 / 资讯站',
        currentRole: '角色动态和世界小道消息表面，已经有参与者调度和延时回复。',
        recommendedLane: 'supporting_evidence',
        memoryPolicy: 'manual_promotion',
        canReadRelationshipMemory: true,
        canEmitDirective: true,
        canReceiveDirective: false,
        usableForPlotPipeline: 'partial',
        notes: [
            '可作为剧情灵感来源，但用户满意后应转成咨询台/剧情指令，而不是自动进主线。',
        ],
        risks: [
            '资讯站文本可能是传闻、小报或夸张风格；必须经过用户采纳才可成为待体验指令。',
        ],
    },
};

export const NARRATIVE_MEMORY_POLICY_BY_LANE: Record<NarrativeLane, NarrativeMemoryPolicy> = {
    mainline: 'main_vault',
    pending_mainline: 'manual_promotion',
    if_line: 'dream_material',
    date_experience: 'relationship_echo',
    keepsake_event: 'local_keepsake',
    user_insight: 'character_private',
    supporting_evidence: 'system_trace',
    sandbox: 'excluded_from_main_vault',
    draft: 'manual_promotion',
};

export const getNarrativeSurfaceBoundary = (id: NarrativeSurfaceId): NarrativeSurfaceBoundary => (
    NARRATIVE_SURFACE_BOUNDARIES[id]
);

export const resolveNarrativeMemoryPolicy = (lane: NarrativeLane): NarrativeMemoryPolicy => (
    NARRATIVE_MEMORY_POLICY_BY_LANE[lane]
);

export const shouldWriteToMainMemory = (lane: NarrativeLane): boolean => (
    resolveNarrativeMemoryPolicy(lane) === 'main_vault'
);

const createDirectiveId = (prefix: string): string => (
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

export const createPendingMainlineDirective = (params: {
    title: string;
    summary: string;
    charIds?: string[];
    npcNames?: string[];
    sourceSurface?: NarrativeSurfaceId;
    tags?: string[];
    constraints?: string[];
    activationHint?: string;
}): NarrativeDirective => {
    const now = Date.now();
    return {
        id: createDirectiveId('plot'),
        title: params.title.trim() || '未命名剧情钩子',
        summary: params.summary.trim(),
        lane: 'pending_mainline',
        status: 'pending',
        sourceSurface: params.sourceSurface || 'consult_desk',
        targetSurface: 'novel',
        charIds: params.charIds || [],
        npcNames: params.npcNames,
        tags: params.tags || [],
        constraints: params.constraints || [],
        activationHint: params.activationHint,
        memoryPolicy: 'manual_promotion',
        createdAt: now,
        updatedAt: now,
    };
};

export const createIfLineDreamDirective = (params: {
    title: string;
    summary: string;
    charIds?: string[];
    sourceSurface?: NarrativeSurfaceId;
    dreamCharId?: string;
    dreamTone?: NarrativeDreamTone;
    tags?: string[];
}): NarrativeDirective => {
    const now = Date.now();
    return {
        id: createDirectiveId('ifdream'),
        title: params.title.trim() || '未命名 IF 梦境',
        summary: params.summary.trim(),
        lane: 'if_line',
        status: 'pending',
        sourceSurface: params.sourceSurface || 'novel',
        targetSurface: 'novel',
        charIds: params.charIds || [],
        tags: params.tags || ['if_line'],
        memoryPolicy: 'dream_material',
        dreamDelivery: params.dreamCharId
            ? {
                charId: params.dreamCharId,
                tone: params.dreamTone,
                instruction: '作为梦、错觉、预感或创作余波递送；不得当作主线已经发生。',
            }
            : undefined,
        createdAt: now,
        updatedAt: now,
    };
};

const directiveLine = (directive: NarrativeDirective): string => {
    const bits = [
        `- ${directive.title}`,
        `lane=${directive.lane}`,
        `status=${directive.status}`,
        `memory=${directive.memoryPolicy}`,
    ];
    if (directive.activationHint) bits.push(`activation=${directive.activationHint}`);
    if (directive.tags?.length) bits.push(`tags=${directive.tags.join('、')}`);
    return `${bits.join(' | ')}\n  ${directive.summary}`;
};

export const getNovelRelevantDirectives = (directives: NarrativeDirective[] = []): NarrativeDirective[] => (
    directives
        .filter(directive => (
            directive.targetSurface === 'novel'
            && directive.status !== 'discarded'
            && directive.status !== 'archived'
        ))
        .sort((a, b) => {
            const aHot = a.status === 'activated' ? 1 : 0;
            const bHot = b.status === 'activated' ? 1 : 0;
            if (aHot !== bHot) return bHot - aHot;
            return b.updatedAt - a.updatedAt;
        })
);

export const formatNarrativeDirectivesForPrompt = (
    directives: NarrativeDirective[] = [],
    budgetChars = 1400,
): string => {
    const relevant = getNovelRelevantDirectives(directives);
    if (relevant.length === 0) {
        return '暂无已采纳的悬挂剧情指令。';
    }

    const header = [
        '【悬挂剧情指令 / Pending Experience Directives】',
        '这些是用户已经采纳、但不一定已经游玩的剧情材料。',
        '- pending_mainline：可以作为本次主线/约会体验的待激活钩子。',
        '- if_line：只能作为梦、错觉、创作分支或角色潜意识材料，不能写成主线事实。',
        '- played/confirmed 之后才允许进入主记忆或时光簿。',
    ].join('\n');

    let output = header;
    for (const directive of relevant) {
        const next = `\n${directiveLine(directive)}`;
        if ((output + next).length > budgetChars) break;
        output += next;
    }
    return output;
};
