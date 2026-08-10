import type { AiTaskDefinition, AiTaskId } from './types.ts';

export const AI_TASK_REGISTRY: Readonly<Record<AiTaskId, AiTaskDefinition>> = {
  dialogue_reply: {
    id: 'dialogue_reply',
    role: 'dialogue',
    purpose: 'visible_character_expression',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  relationship_memory_write: {
    id: 'relationship_memory_write',
    role: 'dialogue',
    purpose: 'relationship_memory',
    truthEffect: 'relationship_memory_candidate',
    requiresRelationshipScope: true,
  },
  character_authored_impression: {
    id: 'character_authored_impression',
    role: 'dialogue',
    purpose: 'relationship_memory',
    truthEffect: 'relationship_memory_candidate',
    requiresRelationshipScope: true,
  },
  history_companion_material_analysis: {
    id: 'history_companion_material_analysis',
    role: 'system_director',
    purpose: 'structured_analysis',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  emotion_background_evaluation: {
    id: 'emotion_background_evaluation',
    role: 'system_director',
    purpose: 'structured_analysis',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  behavior_boundary_compilation: {
    id: 'behavior_boundary_compilation',
    role: 'system_director',
    purpose: 'structured_analysis',
    truthEffect: 'none',
    // Behavior requirements are character-owned. Chat may attach exact
    // relationship provenance, while the character-card compiler can work
    // before the character is linked to a persona.
    requiresRelationshipScope: false,
  },
  worldbook_input_analysis: {
    id: 'worldbook_input_analysis',
    role: 'system_director',
    purpose: 'structured_analysis',
    truthEffect: 'none',
    requiresRelationshipScope: false,
  },
  info_station_generation: {
    id: 'info_station_generation',
    role: 'system_director',
    purpose: 'third_person_planning',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  info_station_editorial_review: {
    id: 'info_station_editorial_review',
    role: 'system_director',
    purpose: 'editorial_review',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  narrative_history_analysis: {
    id: 'narrative_history_analysis',
    role: 'system_director',
    purpose: 'structured_analysis',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  narrative_scene_plan: {
    id: 'narrative_scene_plan',
    role: 'system_director',
    purpose: 'third_person_planning',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  narrative_world_growth_proposal: {
    id: 'narrative_world_growth_proposal',
    role: 'system_director',
    purpose: 'structured_analysis',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  narrative_scene_receipt_proposal: {
    id: 'narrative_scene_receipt_proposal',
    role: 'system_director',
    purpose: 'structured_analysis',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
  life_sim_main_plot: {
    id: 'life_sim_main_plot',
    role: 'system_director',
    purpose: 'third_person_planning',
    truthEffect: 'none',
    requiresRelationshipScope: true,
  },
};

export const aiTaskDefinition = (taskId: AiTaskId): AiTaskDefinition => (
  AI_TASK_REGISTRY[taskId]
);
