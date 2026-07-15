// apps/crawler/src/scripts/ops/discord-bot/types/discord-api.ts
// 定義 Discord REST、Gateway、message component、modal 與 interaction payload 的本地最小型別。

import type { DiscordDeliveryErrorCategory as DbDiscordDeliveryErrorCategory } from "@partsradar/db";

export type DiscordDeliveryErrorCategory = DbDiscordDeliveryErrorCategory;

// Discord delivery 失敗在 transport boundary 產生的安全結構化資料。
export interface DiscordDeliveryFailureMetadata {
  errorCategory: DiscordDeliveryErrorCategory;
  httpStatus: number | null;
  providerErrorCode: number | null;
}

// REST 與 interaction handler 共用的最小 fetch contract。
export type FetchImpl = typeof fetch;

// Discord embed 訊息欄位，供價格報告、目標價通知與設定面板共用。
export interface DiscordBotEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

// Bot 送出的 embed payload，只保留目前 PartsRadarTW 訊息實際使用的欄位。
export interface DiscordBotEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordBotEmbedField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
}

// Bot 送出的 Discord message payload，可用於 webhook、DM 與 interaction follow-up。
export interface DiscordBotMessage {
  content?: string;
  embeds?: DiscordBotEmbed[];
  components?: DiscordMessageComponent[];
}

export type DiscordMessageComponent = DiscordActionRowComponent;

// Discord message component 的 action row 容器，目前承載 button 與 string select。
export interface DiscordActionRowComponent {
  type: 1;
  components: Array<DiscordButtonComponent | DiscordStringSelectComponent>;
}

export interface DiscordButtonComponent {
  type: 2;
  style: number;
  custom_id?: string;
  url?: string;
  label: string;
  disabled?: boolean;
}

export interface DiscordStringSelectComponent {
  type: 3;
  custom_id: string;
  placeholder?: string;
  options: Array<{
    label: string;
    value: string;
    description?: string;
    default?: boolean;
  }>;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
}

// Discord modal payload，使用新版 label component 包住 text input 或 string select。
export interface DiscordModal {
  custom_id: string;
  title: string;
  components: DiscordModalComponent[];
}

export type DiscordModalComponent = DiscordModalLabelComponent | DiscordModalTextDisplayComponent;

// Modal 內的純文字說明 component，用於顯示輸入格式提示或限制說明。
export interface DiscordModalTextDisplayComponent {
  type: 10;
  content: string;
}

// Modal label component 是目前輸入欄位的外層容器，內部才是實際 input component。
export interface DiscordModalLabelComponent {
  type: 18;
  label: string;
  description?: string;
  component: DiscordModalInputComponent;
}

export type DiscordModalInputComponent =
  | DiscordModalStringSelectComponent
  | DiscordModalTextInputComponent;

// Modal 內使用的 string select，供設定表單用選單收集受限選項。
export interface DiscordModalStringSelectComponent {
  type: 3;
  custom_id: string;
  placeholder?: string;
  options: Array<{
    label: string;
    value: string;
    description?: string;
    default?: boolean;
  }>;
  required?: boolean;
  min_values?: number;
  max_values?: number;
}

// Modal 內使用的文字輸入 component，供價格、時間與關鍵字等設定收集使用者輸入。
export interface DiscordModalTextInputComponent {
  type: 4;
  custom_id: string;
  style: number;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  value?: string;
  placeholder?: string;
}

// Discord 發送訊息的統一結果，區分成功、rate limit 與一般失敗。
export type DiscordMessageSendResult =
  | {
      status: "sent";
      messageCount: number;
      httpStatuses: number[];
    }
  | ({
      status: "rate_limited";
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    } & DiscordDeliveryFailureMetadata)
  | ({
      status: "failed";
      messageCount: number;
      sentMessageCount: number;
    } & DiscordDeliveryFailureMetadata);

// Discord REST 呼叫所需的共用選項。
export interface DiscordRestOptions {
  token: string;
  apiBaseUrl: string;
  fetchImpl?: FetchImpl;
}

// Discord REST helper 回傳的統一結果，讓上層不用直接解析 HTTP response。
export type DiscordRestResult<T> =
  | {
      status: "ok";
      httpStatus: number;
      body: T | null;
    }
  | ({
      status: "rate_limited";
      httpStatus: 429;
      retryAfterMs: number;
      global: boolean;
    } & DiscordDeliveryFailureMetadata)
  | ({
      status: "failed";
      retryAfterMs?: number;
    } & DiscordDeliveryFailureMetadata);

// Gateway 收到的原始 payload 外型，只保留 dispatch、sequence 與 event type 判斷所需欄位。
export interface DiscordGatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

// Discord interaction payload 的本地最小型別，涵蓋 slash command、component 與 modal submit。
export interface DiscordInteraction {
  id: string;
  token: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  app_permissions?: string;
  data?: {
    name?: string;
    options?: DiscordInteractionOption[];
    custom_id?: string;
    component_type?: number;
    values?: string[];
    components?: DiscordInteractionComponent[];
  };
  member?: {
    user?: DiscordUser;
    permissions?: string;
  };
  user?: DiscordUser;
}

// Slash command option 的巢狀結構，供 command parser 解析 subcommand 與使用者參數。
export interface DiscordInteractionOption {
  type: number;
  name: string;
  value?: unknown;
  options?: DiscordInteractionOption[];
}

// Modal submit 與 component interaction 的 component tree 節點。
export interface DiscordInteractionComponent {
  type: number;
  custom_id?: string;
  value?: unknown;
  values?: string[];
  component?: DiscordInteractionComponent;
}

// Discord 使用者最小識別資料，僅保留 bot 流程需要的 user id。
export interface DiscordUser {
  id: string;
}

// 建立 DM channel 時 Discord 回傳的最小資料。
export interface DiscordDirectMessageChannel {
  id?: unknown;
}

// Gateway WebSocket wrapper 的最小事件 contract，隔離 runtime WebSocket 實作。
export interface MinimalWebSocketEvent {
  data?: unknown;
}

// Gateway client 需要的最小 WebSocket 介面，避免程式直接綁死特定 WebSocket 實作。
export interface MinimalWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: MinimalWebSocketEvent) => void,
  ): void;
}

export type MinimalWebSocketConstructor = new (url: string) => MinimalWebSocket;
