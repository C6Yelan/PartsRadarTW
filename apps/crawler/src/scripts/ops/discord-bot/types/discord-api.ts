// apps/crawler/src/scripts/ops/discord-bot/types/discord-api.ts

export type FetchImpl = typeof fetch;

export interface DiscordBotEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

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

export interface DiscordBotMessage {
  content?: string;
  embeds?: DiscordBotEmbed[];
  components?: DiscordMessageComponent[];
}

export type DiscordMessageComponent = DiscordActionRowComponent;

export interface DiscordActionRowComponent {
  type: 1;
  components: Array<DiscordButtonComponent | DiscordStringSelectComponent>;
}

export interface DiscordButtonComponent {
  type: 2;
  style: number;
  custom_id: string;
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

export interface DiscordModal {
  custom_id: string;
  title: string;
  components: DiscordModalComponent[];
}

export type DiscordModalComponent = DiscordModalLabelComponent | DiscordModalTextDisplayComponent;

export interface DiscordModalTextDisplayComponent {
  type: 10;
  content: string;
}

export interface DiscordModalLabelComponent {
  type: 18;
  label: string;
  description?: string;
  component: DiscordModalInputComponent;
}

export type DiscordModalInputComponent =
  | DiscordModalStringSelectComponent
  | DiscordModalTextInputComponent;

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

export type DiscordDirectMessageSendResult =
  | {
      status: "sent";
      messageCount: number;
      httpStatuses: number[];
    }
  | {
      status: "rate_limited";
      messageCount: number;
      sentMessageCount: number;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      messageCount: number;
      sentMessageCount: number;
      httpStatus: number | null;
      message: string;
    };

export type DiscordBotMessageSendResult = DiscordDirectMessageSendResult;

export interface DiscordRestOptions {
  token: string;
  apiBaseUrl: string;
  fetchImpl?: FetchImpl;
}

export type DiscordRestResult<T> =
  | {
      status: "ok";
      httpStatus: number;
      body: T | null;
    }
  | {
      status: "rate_limited";
      httpStatus: 429;
      retryAfterMs: number;
      global: boolean;
    }
  | {
      status: "failed";
      httpStatus: number | null;
      message: string;
      retryAfterMs?: number;
    };

export interface DiscordGatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

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
  };
  user?: DiscordUser;
}

export interface DiscordInteractionOption {
  type: number;
  name: string;
  value?: unknown;
  options?: DiscordInteractionOption[];
}

export interface DiscordInteractionComponent {
  type: number;
  custom_id?: string;
  value?: unknown;
  values?: string[];
  component?: DiscordInteractionComponent;
  components?: DiscordInteractionComponent[];
}

export interface DiscordUser {
  id: string;
}

export interface DiscordDirectMessageChannel {
  id?: unknown;
}

export interface MinimalWebSocketEvent {
  data?: unknown;
}

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
