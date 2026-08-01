import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DateState } from '../types.ts';
import {
    buildDateSessionOutputContract,
    resolveDatePresentationMode,
} from '../utils/datePresentation.ts';

assert.equal(resolveDatePresentationMode('auto', true), 'visual', 'auto uses a dedicated portrait');
assert.equal(resolveDatePresentationMode(undefined, false), 'reading', 'auto does not turn an avatar into a portrait');
assert.equal(resolveDatePresentationMode('reading', true), 'reading', 'explicit reading always stays reading');
assert.equal(resolveDatePresentationMode('visual', false), 'reading', 'explicit visual gracefully falls back without a dedicated portrait');

const savedReadingState: Pick<DateState, 'isNovelMode'> = { isNovelMode: true };
const savedVisualState: Pick<DateState, 'isNovelMode'> = { isNovelMode: false };
assert.equal(savedReadingState.isNovelMode ? 'reading' : 'visual', 'reading');
assert.equal(savedVisualState.isNovelMode ? 'reading' : 'visual', 'visual');

const readingContract = buildDateSessionOutputContract('reading');
const visualContract = buildDateSessionOutputContract('visual', ['normal', 'happy']);
assert.equal(readingContract.mode, 'reading');
assert.doesNotMatch(readingContract.systemPrompt, /\[emotion\]/u, 'reading uses prose rather than visual-script labels');
assert.doesNotMatch(readingContract.userPrompt, /System Note|\[emotion\]/u, 'reading keeps the user turn free of mechanical framing');
assert.match(readingContract.systemPrompt, /动作与叙述是可选的/u, 'reading keeps scene detail responsive rather than mandatory');
assert.equal(visualContract.mode, 'visual');
assert.match(visualContract.systemPrompt, /\[emotion\]/u, 'visual keeps the parser-facing emotion format');
assert.match(visualContract.systemPrompt, /台词单独一行/u, 'visual keeps dialogue and action on separate lines');
assert.match(visualContract.systemPrompt, /动作与叙述是可选的/u, 'visual formatting does not force every response into action beats');
assert.doesNotMatch(
    `${readingContract.systemPrompt}\n${visualContract.systemPrompt}`,
    /每一行动作\/叙述都应该|让每一行都有|每轮都必须写动作/u,
    'neither presentation turns optional scene detail into a mandatory response pattern',
);

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const dateAppSource = read('apps/DateApp.tsx');
const dateSessionSource = read('components/date/DateSession.tsx');
const settingsSource = read('components/date/DateSettings.tsx');

assert.match(dateAppSource, /resolveDatePresentationMode\(/u);
assert.match(dateAppSource, /resolveDateDefaultPortrait\(c\)\.hasDedicatedPortrait/u);
assert.match(dateAppSource, /startReadingSession\(c\)/u);
assert.match(dateAppSource, /startPeek\(c\)/u);
assert.match(dateAppSource, /handleSendMessage = async \(text: string, presentationMode: DatePresentationMode\)/u);
assert.match(dateAppSource, /handleReroll = async \(presentationMode: DatePresentationMode\)/u);
assert.match(dateAppSource, /buildDateSessionOutputContract\(presentationMode, dateEmotions\)/u);

assert.match(dateSessionSource, /initialState\?\.isNovelMode \?\? initialPresentationMode === 'reading'/u);
assert.match(dateSessionSource, /setIsNovelMode\(initialState\.isNovelMode\)/u);
assert.match(dateSessionSource, /onSendMessage\(text, isNovelMode \? 'reading' : 'visual'\)/u);
assert.match(dateSessionSource, /onReroll\(isNovelMode \? 'reading' : 'visual'\)/u);
assert.match(dateSessionSource, /data-date-presentation=\{isNovelMode \? 'reading' : 'visual'\}/u);
assert.match(dateSessionSource, /data-date-reading-view/u);
assert.match(dateSessionSource, /\{!isNovelMode && <img src=\{char\.avatar\}/u, 'reading must not render an avatar as a visual substitute');
assert.match(dateSessionSource, /\{!isNovelMode && \(/u, 'the visual layer remains excluded from reading');

assert.match(settingsSource, /默认见面视图/u);
assert.match(settingsSource, /自动推荐/u);
assert.match(settingsSource, /datePresentationPreference/u);
assert.match(settingsSource, /dateLightReading/u, 'palette remains an independent setting');

console.log('date presentation contract: OK — auto fallback, saved mode, view switching, and output formats are guarded');
