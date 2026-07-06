// apps/crawler/src/scripts/ops/discord-bot/commands/watch-components.ts
// 產生目標價 watch 的新增與編輯 modal，維持 watch handler 與 parser 共用的 Discord UI contract。

import {
  DISCORD_COMPONENT_TYPE_LABEL,
  DISCORD_COMPONENT_TYPE_TEXT_INPUT,
  DISCORD_TEXT_INPUT_STYLE_SHORT,
  MAX_TARGET_PRICE,
} from "../constants";
import type {
  DiscordModal,
  TargetPriceWatchSortKey,
  TargetPriceWatchStatusFilter,
} from "../types";
import {
  WATCH_CREATE_MODAL_CUSTOM_ID,
  WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX,
  WATCH_PRODUCT_CUSTOM_ID,
  WATCH_TARGET_PRICE_CUSTOM_ID,
} from "./ids";

// 建立新增目標價 watch 的 modal，讓使用者輸入 PartsRadarTW 商品識別與目標價格。
export function createWatchModal({
  productValue = "",
  targetPriceValue = "",
}: {
  productValue?: string;
  targetPriceValue?: string;
} = {}): DiscordModal {
  return {
    custom_id: WATCH_CREATE_MODAL_CUSTOM_ID,
    title: "新增商品目標價",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "PartsRadarTW 商品",
        description: "貼上商品頁完整網址，或輸入網址 /products/ 後面的商品 ID。",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: WATCH_PRODUCT_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 1,
          max_length: 300,
          required: true,
          ...(productValue ? { value: productValue } : {}),
          placeholder: "https://partsradar.net/products/...",
        },
      },
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "理想入手價格（新台幣）",
        description: "輸入希望入手的價格，只填整數，不要加 NT$、逗號或空格。",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: WATCH_TARGET_PRICE_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 1,
          max_length: String(MAX_TARGET_PRICE).length,
          required: true,
          ...(targetPriceValue ? { value: targetPriceValue } : {}),
          placeholder: "17500",
        },
      },
    ],
  };
}

// 建立修改既有 watch 目標價格的 modal，並把列表狀態編入 custom_id 供提交後回到原頁。
export function createWatchEditModal({
  watchId,
  targetPrice,
  page,
  statusFilter = "all",
  sortKey = "recent",
}: {
  watchId: string;
  targetPrice: number;
  page: number;
  statusFilter?: TargetPriceWatchStatusFilter;
  sortKey?: TargetPriceWatchSortKey;
}): DiscordModal {
  return {
    custom_id: `${WATCH_EDIT_MODAL_CUSTOM_ID_PREFIX}${watchId}:${page}:${statusFilter}:${sortKey}`,
    title: "修改商品目標價",
    components: [
      {
        type: DISCORD_COMPONENT_TYPE_LABEL,
        label: "新的目標價格（新台幣）",
        description: "只會修改目前選取的商品；請填整數，不要加 NT$、逗號或空格。",
        component: {
          type: DISCORD_COMPONENT_TYPE_TEXT_INPUT,
          custom_id: WATCH_TARGET_PRICE_CUSTOM_ID,
          style: DISCORD_TEXT_INPUT_STYLE_SHORT,
          min_length: 1,
          max_length: String(MAX_TARGET_PRICE).length,
          required: true,
          value: String(targetPrice),
          placeholder: "17500",
        },
      },
    ],
  };
}
