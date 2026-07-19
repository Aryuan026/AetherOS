import type { APIConfig, ApiPreset } from '../types';

/** Activate a saved LLM preset without erasing the device-wide MiniMax account. */
export const apiConfigForActivatedPreset = (current: APIConfig, preset: ApiPreset): APIConfig => ({
    ...current,
    ...preset.config,
    minimaxApiKey: current.minimaxApiKey,
    minimaxGroupId: current.minimaxGroupId,
});
