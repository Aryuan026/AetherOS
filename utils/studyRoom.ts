import { APIConfig, QuizQuestion, StudyChapter, StudyCourse } from '../types';

export const STUDY_STORAGE_KEYS = {
    apiConfig: 'study_api_config',
    tutorPresets: 'study_tutor_presets',
} as const;

export const STUDY_MAX_PDF_BYTES = 25 * 1024 * 1024;
export const STUDY_MAX_PDF_PAGES = 50;
export const STUDY_CHAPTER_OVERLAP_CHARS = 2000;

export const STUDY_COVER_GRADIENTS = [
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(120deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)',
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(to top, #5ee7df 0%, #b490ca 100%)',
    'linear-gradient(to right, #43e97b 0%, #38f9d7 100%)',
] as const;

export type StudyQuizType = QuizQuestion['type'];

export const DEFAULT_STUDY_QUIZ_TYPES: StudyQuizType[] = ['choice', 'true_false', 'fill_blank'];

const QUIZ_TYPES = new Set<StudyQuizType>(DEFAULT_STUDY_QUIZ_TYPES);
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export const buildEffectiveStudyApi = (
    studyApi: Partial<APIConfig>,
    globalApi: APIConfig
): APIConfig => ({
    baseUrl: studyApi.baseUrl || globalApi.baseUrl,
    apiKey: studyApi.apiKey || globalApi.apiKey,
    model: studyApi.model || globalApi.model,
});

export const assertStudyApiReady = (api: APIConfig) => {
    if (!api.baseUrl?.trim()) throw new Error('API Base URL missing');
    if (!api.apiKey?.trim()) throw new Error('API Key missing');
    if (!api.model?.trim()) throw new Error('Model missing');
};

export const buildStudyChatCompletionUrl = (api: APIConfig) => (
    `${api.baseUrl.replace(/\/+$/, '')}/chat/completions`
);

export const extractAiMessageText = (data: any): string => (
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.message?.reasoning_content ||
    ''
).trim();

export const normalizeStudyDifficulty = (value: unknown): StudyChapter['difficulty'] => {
    if (value === 'easy' || value === 'hard') return value;
    return 'normal';
};

export const buildStudyChaptersFromOutline = (
    rawChapters: any,
    sourceTextLength: number
): StudyChapter[] => {
    const candidates = Array.isArray(rawChapters) && rawChapters.length > 0
        ? rawChapters.slice(0, 12)
        : [{ title: '导读', summary: '从材料整体开始梳理。', difficulty: 'normal' }];

    const safeLength = Math.max(0, sourceTextLength || 0);
    const rangeSize = candidates.length > 0 ? Math.ceil(safeLength / candidates.length) : safeLength;

    return candidates.map((chapter: any, index: number) => {
        const start = Math.min(safeLength, index * rangeSize);
        const end = index === candidates.length - 1
            ? safeLength
            : Math.min(safeLength, (index + 1) * rangeSize);

        return {
            id: `ch-${index}`,
            title: String(chapter?.title || `第 ${index + 1} 章`).trim(),
            summary: String(chapter?.summary || '待讲解内容').trim(),
            difficulty: normalizeStudyDifficulty(chapter?.difficulty),
            isCompleted: false,
            rawContentRange: { start, end },
        };
    });
};

export const getStudyChapterSource = (
    course: StudyCourse,
    chapterIdx: number,
    overlapChars: number = STUDY_CHAPTER_OVERLAP_CHARS
): string => {
    const rawText = course.rawText || '';
    if (!rawText) return '';

    const safeIndex = Math.max(0, Math.min(chapterIdx, Math.max(course.chapters.length - 1, 0)));
    const chapter = course.chapters[safeIndex];
    const fallbackSize = Math.ceil(rawText.length / Math.max(course.chapters.length, 1));
    const fallbackStart = safeIndex * fallbackSize;
    const fallbackEnd = safeIndex === course.chapters.length - 1
        ? rawText.length
        : Math.min(rawText.length, fallbackStart + fallbackSize);

    const start = Math.max(0, (chapter?.rawContentRange?.start ?? fallbackStart) - overlapChars);
    const end = Math.min(rawText.length, (chapter?.rawContentRange?.end ?? fallbackEnd) + overlapChars);

    return rawText.slice(start, Math.max(start, end));
};

const normalizeQuizType = (value: unknown): StudyQuizType => (
    QUIZ_TYPES.has(value as StudyQuizType) ? value as StudyQuizType : 'choice'
);

const normalizeChoiceAnswer = (value: unknown): string => {
    const raw = String(value || '').trim();
    const letter = raw.match(/[A-D]/i)?.[0];
    return (letter || raw).toUpperCase();
};

export const normalizeQuizQuestions = (rawQuestions: any): QuizQuestion[] => {
    if (!Array.isArray(rawQuestions)) return [];

    return rawQuestions
        .map((question: any, index: number): QuizQuestion | null => {
            const type = normalizeQuizType(question?.type);
            const stem = String(question?.stem || '').trim();
            if (!stem) return null;

            const base = {
                id: `q-${Date.now()}-${index}`,
                type,
                stem,
                answer: String(question?.answer || '').trim(),
                explanation: String(question?.explanation || '').trim(),
            };

            if (type === 'choice') {
                const options = Array.isArray(question?.options) ? question.options.slice(0, 4) : [];
                const normalizedOptions = options
                    .map((option: any, optionIndex: number) => {
                        const text = String(option || '').trim();
                        if (!text) return '';
                        return /^[A-D][\.\、:：\s]/i.test(text)
                            ? text
                            : `${OPTION_LABELS[optionIndex]}. ${text}`;
                    })
                    .filter(Boolean);
                if (normalizedOptions.length < 2) return null;

                return {
                    ...base,
                    options: normalizedOptions,
                    answer: normalizeChoiceAnswer(question?.answer),
                };
            }

            return base;
        })
        .filter((question): question is QuizQuestion => Boolean(question));
};

export const getStudyScorePercent = (score: number, total: number): number => {
    if (!Number.isFinite(total) || total <= 0) return 0;
    return Math.round((score / total) * 100);
};

export const formatPdfByteLimit = () => `${Math.round(STUDY_MAX_PDF_BYTES / 1024 / 1024)}MB`;
