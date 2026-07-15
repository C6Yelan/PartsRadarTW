// apps/crawler/src/scripts/ops/discord-bot/commands/keyword-modal.ts
// 共用個人與公開價格報告的商品名稱關鍵字 modal 呈現，保留各自既有 custom_id。

import {
  DISCORD_COMPONENT_TYPE_LABEL,
  DISCORD_COMPONENT_TYPE_TEXT_INPUT,
  DISCORD_TEXT_INPUT_STYLE_SHORT,
  MAX_PRICE_REPORT_KEYWORD_LENGTH,
} from "../constants";
import type { DiscordModal } from "../types";
import { splitProductKeywordInputGroups } from "./settings-input";

const KEYWORD_PLACEHOLDERS = ["例：RTX 5090", "例：RX 9070 XT", "例：DDR5 32GB"];

export function createProductKeywordModal({
  modalCustomId,
  inputCustomIds,
  keywordValue,
}: {
  modalCustomId: string;
  inputCustomIds: readonly string[];
  keywordValue: string;
}): DiscordModal {
  const keywordGroups = splitProductKeywordInputGroups(keywordValue);

  return {
    custom_id: modalCustomId,
    title: "商品名稱關鍵字",
    components: inputCustomIds.map((customId, index) => ({
      type: DISCORD_COMPONENT_TYPE_LABEL,
      label: `其中一組關鍵字 ${index + 1}`,
      description:
        index === 0
          ? "同一欄的詞要全部出現在商品名稱中；不同欄只要符合其中一組。全部留空代表不限。"
          : undefined,
      component: {
        type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
        custom_id: customId,
        style: DISCORD_TEXT_INPUT_STYLE_SHORT,
        max_length: MAX_PRICE_REPORT_KEYWORD_LENGTH,
        required: false,
        value: keywordGroups[index] ?? "",
        placeholder: KEYWORD_PLACEHOLDERS[index],
      },
    })),
  };
}
