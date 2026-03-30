/**
 * External channels — pluggable data sources for live context injection.
 */

// Types and interface
export type {
  ChannelType,
  ChannelStatus,
  ChannelConfig,
  ChannelMemoryCandidate,
  ChannelFetchResult,
  ChannelCacheEntry,
  ChannelCacheFile,
  ExternalChannel,
} from "./channel";

// Channel implementations
export { GitHubChannel } from "./github";
export { SentryChannel } from "./sentry";
export { LinearChannel } from "./linear";
export { JiraChannel } from "./jira";
export { CompetitorChannel } from "./competitor";
export { LocalTasksChannel } from "./local-tasks";

// Manager
export {
  getDefaultRegistry,
  checkAll,
  fetchAll,
  candidateToMemory,
  loadChannelCache,
  saveChannelCache,
  loadCachedChannelMemories,
  isChannelCacheStale,
  triggerChannelRefresh,
} from "./manager";
