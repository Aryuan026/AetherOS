import type { DatePresentationMode, DatePresentationPreference } from '../types';

export const resolveDatePresentationMode = (
    preference: DatePresentationPreference | null | undefined,
    hasDedicatedPortrait: boolean,
): DatePresentationMode => {
    if (preference === 'reading') return 'reading';
    if (preference === 'visual') return hasDedicatedPortrait ? 'visual' : 'reading';
    return hasDedicatedPortrait ? 'visual' : 'reading';
};

export type DateSessionOutputContract = {
    mode: DatePresentationMode;
    systemPrompt: string;
    userPrompt: string;
};

export const buildDateSessionOutputContract = (
    mode: DatePresentationMode,
    availableEmotions: readonly string[] = [],
): DateSessionOutputContract => {
    if (mode === 'reading') {
        return {
            mode,
            systemPrompt: `### 输出载体：阅读
你正在与用户进行面对面的互动见面。用自然段落写角色的对白、动作和可观察叙述；动作与叙述是可选的，只在这次场景确实需要时出现，段落与节奏服务于这一次日常场景，不把它扩写成长主线小说。
不要输出方括号情绪标签、系统前缀、角色名加冒号或机械脚本标记。只生成角色和可观察的场景，不替用户补写台词、心理或决定。`,
            userPrompt: '请以自然阅读段落回应：保留本轮见面的互动感，不使用标签、系统前缀或脚本格式。',
        };
    }

    return {
        mode,
        systemPrompt: `### 输出载体：场景
你正在与用户进行面对面的互动见面。这是视觉小说脚本模式，前端会按换行解析场景与气泡。
每一行都必须以 \`[emotion]\` 开头；仅使用这些情绪：${availableEmotions.join(', ')}。台词单独一行并用双引号；动作与叙述是可选的，只在场景需要时单独成行且不加引号，禁止在同一行混写。只生成角色和可观察的场景，不替用户补写台词、心理或决定。`,
        userPrompt: '保持场景的行首情绪标签，以及台词与动作/叙述分行格式；内容长度和节奏服从角色卡、本轮互动与现场。',
    };
};
