import type { APIConfig, ApiPreset } from '../../types.ts';
import {
  aiTaskDefinition,
  type AiRuntimeRoutingV1,
  type AiTaskId,
  type AiTaskProviderRef,
  type AiTaskRouteFailureReason,
} from '../../domain/aiRuntime/index.ts';

export const DEFAULT_AI_RUNTIME_ROUTING: AiRuntimeRoutingV1 = {
  version: 1,
  systemDirector: { mode: 'inherit_dialogue' },
};

export const normalizeAiRuntimeRouting = (value: unknown): AiRuntimeRoutingV1 => {
  if (!value || typeof value !== 'object') return DEFAULT_AI_RUNTIME_ROUTING;
  const source = value as Partial<AiRuntimeRoutingV1>;
  const binding = source.systemDirector;
  if (
    binding
    && binding.mode === 'preset'
    && typeof binding.presetId === 'string'
    && binding.presetId.trim()
  ) {
    return {
      version: 1,
      systemDirector: {
        mode: 'preset',
        presetId: binding.presetId.trim(),
      },
    };
  }
  return DEFAULT_AI_RUNTIME_ROUTING;
};

const configReady = (config: APIConfig): boolean => (
  Boolean(config.baseUrl.trim() && config.model.trim())
);

export type ResolvedAiTaskRoute =
  | {
    ok: true;
    taskId: AiTaskId;
    config: APIConfig;
    provider: AiTaskProviderRef;
  }
  | {
    ok: false;
    taskId: AiTaskId;
    reason: AiTaskRouteFailureReason;
    message: string;
  };

export const resolveAiTaskRoute = (input: {
  taskId: AiTaskId;
  dialogueConfig: APIConfig;
  apiPresets: readonly ApiPreset[];
  routing: AiRuntimeRoutingV1;
}): ResolvedAiTaskRoute => {
  const task = aiTaskDefinition(input.taskId);
  if (task.role === 'dialogue') {
    if (!configReady(input.dialogueConfig)) {
      return {
        ok: false,
        taskId: input.taskId,
        reason: 'dialogue_config_incomplete',
        message: '请先在设置里启用一份可用的对话 AI 配置。',
      };
    }
    return {
      ok: true,
      taskId: input.taskId,
      config: input.dialogueConfig,
      provider: {
        role: 'dialogue',
        binding: 'dialogue',
        baseUrl: input.dialogueConfig.baseUrl,
        model: input.dialogueConfig.model,
      },
    };
  }

  const routing = normalizeAiRuntimeRouting(input.routing);
  if (routing.systemDirector.mode === 'inherit_dialogue') {
    if (!configReady(input.dialogueConfig)) {
      return {
        ok: false,
        taskId: input.taskId,
        reason: 'dialogue_config_incomplete',
        message: '系统主持正在跟随对话 AI；请先启用一份可用的对话 AI 配置。',
      };
    }
    return {
      ok: true,
      taskId: input.taskId,
      config: input.dialogueConfig,
      provider: {
        role: 'system_director',
        binding: 'inherit_dialogue',
        baseUrl: input.dialogueConfig.baseUrl,
        model: input.dialogueConfig.model,
      },
    };
  }

  const systemDirectorPresetId = routing.systemDirector.presetId;
  const preset = input.apiPresets.find(item => item.id === systemDirectorPresetId);
  if (!preset) {
    return {
      ok: false,
      taskId: input.taskId,
      reason: 'system_director_preset_missing',
      message: '系统主持选择的 API 预设已经不存在，请到设置里重新选择。',
    };
  }
  if (!configReady(preset.config)) {
    return {
      ok: false,
      taskId: input.taskId,
      reason: 'system_director_preset_incomplete',
      message: `系统主持预设“${preset.name}”缺少 URL 或模型名，请先补全。`,
    };
  }
  return {
    ok: true,
    taskId: input.taskId,
    config: preset.config,
    provider: {
      role: 'system_director',
      binding: 'preset',
      presetId: preset.id,
      presetName: preset.name,
      baseUrl: preset.config.baseUrl,
      model: preset.config.model,
    },
  };
};
