/**
 * Consumer registries — node definitions synced from consuming repos.
 * Import individual registries or use mergeRegistries() to combine them.
 */
import type { NodeRegistry } from "../core/types";

export {
  SUPRATEAM_REGISTRY,
  SUPRATEAM_TRIGGERS,
  SUPRATEAM_ACTIONS,
  SUPRATEAM_TRIGGER_CONFIGS,
  SUPRATEAM_ACTION_CONFIGS,
  SUPRATEAM_CONDITION_FIELDS,
} from "./suprateam";

export {
  SUPRALOOP_REGISTRY,
  SUPRALOOP_TRIGGERS,
  SUPRALOOP_ACTIONS,
  SUPRALOOP_TRIGGER_CONFIGS,
  SUPRALOOP_ACTION_CONFIGS,
  SUPRALOOP_CONDITION_FIELDS,
} from "./supraloop";

export {
  AUTOPURCHASER_REGISTRY,
  AUTOPURCHASER_TRIGGERS,
  AUTOPURCHASER_ACTIONS,
  AUTOPURCHASER_TRIGGER_CONFIGS,
  AUTOPURCHASER_ACTION_CONFIGS,
  AUTOPURCHASER_CONDITION_FIELDS,
} from "./autopurchaser";

/**
 * Merge multiple NodeRegistry objects into one.
 * Useful when a consumer wants to combine registries from multiple sources.
 */
export function mergeRegistries(...registries: NodeRegistry[]): NodeRegistry {
  return {
    triggers: registries.flatMap((r) => r.triggers),
    actions: registries.flatMap((r) => r.actions),
    logic: registries.flatMap((r) => r.logic ?? []),
    triggerConfigs: Object.assign({}, ...registries.map((r) => r.triggerConfigs ?? {})),
    actionConfigs: Object.assign({}, ...registries.map((r) => r.actionConfigs ?? {})),
    conditionFields: registries.flatMap((r) => r.conditionFields ?? []),
  };
}
