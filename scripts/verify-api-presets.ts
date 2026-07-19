import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { APIConfig, ApiPreset } from '../types.ts';
import { apiConfigForActivatedPreset } from '../utils/apiPresets.ts';

const current: APIConfig = {
    baseUrl: 'https://old.example/v1',
    apiKey: 'old-key',
    model: 'old-model',
    minimaxApiKey: 'voice-key',
    minimaxGroupId: 'voice-group',
};
const preset: ApiPreset = {
    id: 'preset-a',
    name: '陪伴模型',
    config: {
        baseUrl: 'https://new.example/v1',
        apiKey: 'new-key',
        model: 'new-model',
    },
};

assert.deepEqual(apiConfigForActivatedPreset(current, preset), {
    baseUrl: 'https://new.example/v1',
    apiKey: 'new-key',
    model: 'new-model',
    minimaxApiKey: 'voice-key',
    minimaxGroupId: 'voice-group',
});

const settingsSource = readFileSync(new URL('../apps/Settings.tsx', import.meta.url), 'utf8');
const contextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
assert.match(settingsSource, /已放入编辑区，还没有启用/);
assert.match(settingsSource, /保存并启用当前填写/);
assert.match(settingsSource, /copyPresetName/);
assert.match(settingsSource, /复制当前模型名/);
assert.match(settingsSource, /activateApiPreset\(preset\.id\)/);
assert.match(contextSource, /os_active_api_preset_id/);
assert.match(contextSource, /activeApiPresetId:/);

console.log('api preset load, copy, activation and backup contract: OK');
