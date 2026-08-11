
import { NovelBook } from '../types';
import { formatNarrativeDirectivesForPrompt } from './narrativeBoundaries';

// --- Visual Themes ---
export const NOVEL_THEMES = [
    { id: 'manuscript', name: '雾白稿纸', bg: 'bg-[#f2f1ee]', paper: 'bg-[#fffdf9]', text: 'text-slate-800', accent: 'text-slate-600', button: 'bg-slate-700', activeTab: 'bg-slate-700 text-white' },
    { id: 'sakura', name: '樱花 (Sakura)', bg: 'bg-pink-50', paper: 'bg-[#fff5f7]', text: 'text-slate-700', accent: 'text-pink-500', button: 'bg-pink-400', activeTab: 'bg-pink-500 text-white' },
    { id: 'parchment', name: '羊皮纸 (Vintage)', bg: 'bg-[#f5e6d3]', paper: 'bg-[#fdf6e3]', text: 'text-[#433422]', accent: 'text-[#8c6b48]', button: 'bg-[#b58900]', activeTab: 'bg-[#b58900] text-white' },
    { id: 'kraft', name: '牛皮纸 (Kraft)', bg: 'bg-[#d7ccc8]', paper: 'bg-[#e7e0d8]', text: 'text-[#3e2723]', accent: 'text-[#5d4037]', button: 'bg-[#5d4037]', activeTab: 'bg-[#5d4037] text-white' },
    { id: 'midnight', name: '深夜 (Midnight)', bg: 'bg-[#0f172a]', paper: 'bg-[#1e293b]', text: 'text-slate-300', accent: 'text-blue-400', button: 'bg-blue-600', activeTab: 'bg-blue-600 text-white' },
    { id: 'matcha', name: '抹茶 (Matcha)', bg: 'bg-[#ecfccb]', paper: 'bg-[#f7fee7]', text: 'text-emerald-800', accent: 'text-emerald-600', button: 'bg-emerald-500', activeTab: 'bg-emerald-500 text-white' },
];

/*
 * The manuscript surface owns prose generation only. Role-as-author personas,
 * MBTI-derived prose styles, and co-writer chat modes deliberately do not live
 * in this module; selected characters provide cast and Worldbook scope, not the
 * model's prose personality.
 */

export const buildPlainNovelPrompt = (input: {
    activeBook: NovelBook;
    userText: string;
    storyContext: string;
    creativeSchemeContext: string;
    worldbookContext?: string;
    acceptedScene?: {
        title: string;
        location?: string;
        objective?: string;
        constraints?: readonly string[];
    };
}): string => {
    const protagonists = input.activeBook.protagonists.length
        ? input.activeBook.protagonists.map(item => `- ${item.name}（${item.role}）：${item.description || '暂无补充'}`).join('\n')
        : '- 暂未单独登记；以正文中已经出现的人物为准。';
    const directives = formatNarrativeDirectivesForPrompt(input.activeBook.directives || []);
    const scene = input.acceptedScene ? [
        `- 场景：${input.acceptedScene.title}`,
        input.acceptedScene.location ? `- 起点：${input.acceptedScene.location}` : '',
        input.acceptedScene.objective ? `- 想探索的方向：${input.acceptedScene.objective}` : '',
        input.acceptedScene.constraints?.length ? `- 已确认边界：${input.acceptedScene.constraints.join('；')}` : '',
    ].filter(Boolean).join('\n') : '本轮没有额外指定的场景壳。';

    return `${input.creativeSchemeContext}

【作品】
书名：《${input.activeBook.title}》
简介：${input.activeBook.summary || '暂无'}
本书补充设定：${input.activeBook.worldSetting || '暂无'}

【剧中人】
${protagonists}

【持续生效的创作方向】
${directives || '暂无额外方向'}

【本轮现场】
${scene}

${input.worldbookContext || ''}

【上文】
${input.storyContext}

【本轮要求】
${input.userText.trim() || '从上文自然续写，推动人物与局面继续向前。'}

本轮通常可以续写约 600–1200 个中文字符；如果现场只适合更短的一幕，按作品节奏自然收束。`;
};
