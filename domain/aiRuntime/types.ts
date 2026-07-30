export type AiModelRole = 'dialogue' | 'system_director';

export type AiTaskId =
  | 'dialogue_reply'
  | 'relationship_memory_write'
  | 'character_authored_impression'
  | 'history_companion_material_analysis'
  | 'emotion_background_evaluation'
  | 'behavior_boundary_compilation'
  | 'info_station_generation'
  | 'info_station_editorial_review'
  | 'narrative_history_analysis'
  | 'narrative_scene_plan'
  | 'life_sim_main_plot';

export type AiProviderBinding =
  | { mode: 'inherit_dialogue' }
  | { mode: 'preset'; presetId: string };

export interface AiRuntimeRoutingV1 {
  version: 1;
  systemDirector: AiProviderBinding;
}

export interface AiTaskDefinition {
  id: AiTaskId;
  role: AiModelRole;
  purpose:
    | 'visible_character_expression'
    | 'relationship_memory'
    | 'structured_analysis'
    | 'editorial_review'
    | 'third_person_planning';
  truthEffect: 'none' | 'relationship_memory_candidate';
  requiresRelationshipScope: boolean;
}

export type AiTaskRouteFailureReason =
  | 'dialogue_config_incomplete'
  | 'system_director_preset_missing'
  | 'system_director_preset_incomplete';

export interface AiTaskProviderRef {
  role: AiModelRole;
  binding: 'dialogue' | 'inherit_dialogue' | 'preset';
  presetId?: string;
  presetName?: string;
  model: string;
  baseUrl: string;
}
