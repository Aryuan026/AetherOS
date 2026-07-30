import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { APIConfig, ApiPreset } from '../types.ts';
import {
  AI_TASK_REGISTRY,
  type AiRuntimeRoutingV1,
} from '../domain/aiRuntime/index.ts';
import {
  DEFAULT_AI_RUNTIME_ROUTING,
  normalizeAiRuntimeRouting,
  resolveAiTaskRoute,
} from '../utils/aiRuntime/index.ts';

const dialogueConfig: APIConfig = {
  baseUrl: 'https://dialogue.example/v1',
  apiKey: 'dialogue-secret',
  model: 'dialogue-model',
};
const systemPreset: ApiPreset = {
  id: 'system-preset',
  name: '结构化主持',
  config: {
    baseUrl: 'https://system.example/v1',
    apiKey: 'system-secret',
    model: 'system-model',
  },
};

assert.equal(AI_TASK_REGISTRY.dialogue_reply.role, 'dialogue');
assert.equal(AI_TASK_REGISTRY.relationship_memory_write.role, 'dialogue');
assert.equal(AI_TASK_REGISTRY.history_companion_material_analysis.role, 'system_director');
assert.equal(AI_TASK_REGISTRY.emotion_background_evaluation.role, 'system_director');
assert.equal(AI_TASK_REGISTRY.behavior_boundary_compilation.role, 'system_director');
assert.equal(AI_TASK_REGISTRY.behavior_boundary_compilation.requiresRelationshipScope, false);
assert.equal(AI_TASK_REGISTRY.narrative_scene_plan.truthEffect, 'none');

assert.deepEqual(normalizeAiRuntimeRouting(undefined), DEFAULT_AI_RUNTIME_ROUTING);
assert.deepEqual(normalizeAiRuntimeRouting({
  version: 99,
  systemDirector: { mode: 'unknown' },
}), DEFAULT_AI_RUNTIME_ROUTING);

const inherited = resolveAiTaskRoute({
  taskId: 'history_companion_material_analysis',
  dialogueConfig,
  apiPresets: [systemPreset],
  routing: DEFAULT_AI_RUNTIME_ROUTING,
});
assert.equal(inherited.ok, true);
if (inherited.ok) {
  assert.equal(inherited.config.model, 'dialogue-model');
  assert.equal(inherited.provider.binding, 'inherit_dialogue');
  assert.equal('apiKey' in inherited.provider, false);
}

const explicitRouting: AiRuntimeRoutingV1 = {
  version: 1,
  systemDirector: { mode: 'preset', presetId: systemPreset.id },
};
const explicit = resolveAiTaskRoute({
  taskId: 'emotion_background_evaluation',
  dialogueConfig,
  apiPresets: [systemPreset],
  routing: explicitRouting,
});
assert.equal(explicit.ok, true);
if (explicit.ok) {
  assert.equal(explicit.config.model, 'system-model');
  assert.equal(explicit.provider.presetId, systemPreset.id);
  assert.equal(explicit.provider.role, 'system_director');
}

const dialogueAlwaysOwnsRelationshipMemory = resolveAiTaskRoute({
  taskId: 'relationship_memory_write',
  dialogueConfig,
  apiPresets: [systemPreset],
  routing: explicitRouting,
});
assert.equal(dialogueAlwaysOwnsRelationshipMemory.ok, true);
if (dialogueAlwaysOwnsRelationshipMemory.ok) {
  assert.equal(dialogueAlwaysOwnsRelationshipMemory.config.model, 'dialogue-model');
  assert.equal(dialogueAlwaysOwnsRelationshipMemory.provider.role, 'dialogue');
}

const missingPreset = resolveAiTaskRoute({
  taskId: 'history_companion_material_analysis',
  dialogueConfig,
  apiPresets: [],
  routing: explicitRouting,
});
assert.equal(missingPreset.ok, false);
if (!missingPreset.ok) {
  assert.equal(missingPreset.reason, 'system_director_preset_missing');
  assert.match(missingPreset.message, /不会|重新选择|不存在/u);
}

const incompletePreset = resolveAiTaskRoute({
  taskId: 'history_companion_material_analysis',
  dialogueConfig,
  apiPresets: [{
    ...systemPreset,
    config: { ...systemPreset.config, model: '' },
  }],
  routing: explicitRouting,
});
assert.equal(incompletePreset.ok, false);
if (!incompletePreset.ok) {
  assert.equal(incompletePreset.reason, 'system_director_preset_incomplete');
}

const contextSource = readFileSync(new URL('../context/OSContext.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../apps/Settings.tsx', import.meta.url), 'utf8');
const historySource = readFileSync(new URL('../apps/DailyArchiveApp.tsx', import.meta.url), 'utf8');
const chatSource = readFileSync(new URL('../apps/Chat.tsx', import.meta.url), 'utf8');
const emotionSettingsSource = readFileSync(new URL('../components/chat/EmotionSettingsModal.tsx', import.meta.url), 'utf8');

assert.match(contextSource, /os_ai_runtime_routing_v1/);
assert.match(contextSource, /aiRuntimeRouting: \(mode === 'text_only' \|\| mode === 'full'\)/);
assert.match(contextSource, /if \(data\.aiRuntimeRouting\) updateAiRuntimeRouting/);
assert.match(settingsSource, /系统主持 AI/);
assert.match(settingsSource, /跟随对话 AI/);
assert.match(settingsSource, /不会偷偷改用别的模型/);
assert.match(historySource, /history_companion_material_analysis/);
assert.match(chatSource, /emotion_background_evaluation/);
assert.doesNotMatch(emotionSettingsSource, /副 API 配置|apiKey|baseUrl/u);

console.log('dual AI task routing, visible failure and backup wiring: OK');
