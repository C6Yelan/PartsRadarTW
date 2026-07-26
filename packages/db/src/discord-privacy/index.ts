// packages/db/src/discord-privacy/index.ts
// 公開匯出 Discord privacy 的 user、guild、驗證與 retention domain contract。

export type { DiscordGuildDataSummary, DiscordGuildEraseResult } from "./guild";
export { eraseDiscordGuildData, inspectDiscordGuildData } from "./guild";
export type { DiscordRetentionSummary } from "./retention";
export {
  cleanupDiscordRetention,
  DISCORD_RETENTION_POLICY,
  inspectDiscordRetentionCandidates,
  resolveDiscordPublicReportPurgeAfter,
} from "./retention";
export type {
  DiscordUserDataSummary,
  DiscordUserEraseResult,
} from "./user";
export { eraseDiscordUserData, inspectDiscordUserData } from "./user";
export type {
  CreatedDiscordPrivacyVerification,
  DiscordPrivacyRequestType,
  VerifyDiscordPrivacyCodeResult,
} from "./verification";
export {
  cancelDiscordPrivacyVerification,
  createDiscordPrivacyVerification,
  readDiscordPrivacyVerificationStatus,
  verifyDiscordPrivacyCode,
} from "./verification";
export {
  eraseVerifiedDiscordUserData,
  inspectVerifiedDiscordUserData,
} from "./verified-user";
