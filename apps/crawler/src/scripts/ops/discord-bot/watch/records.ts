// apps/crawler/src/scripts/ops/discord-bot/watch/records.ts

import type { Prisma } from "@partsradar/db";
import type {
  TargetPriceWatchSortKey,
  TargetPriceWatchStatusFilter,
} from "../types";

export const TARGET_PRICE_WATCH_PRODUCT_SELECT = {
  id: true,
  name: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: {
          price: true,
          currency: true,
          capturedAt: true,
        },
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

export const TARGET_PRICE_WATCH_SELECT = {
  id: true,
  discordUserId: true,
  productId: true,
  targetPrice: true,
  currency: true,
  enabled: true,
  lastNotifiedAt: true,
  notificationCursorAt: true,
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

export const TARGET_PRICE_WATCH_LIST_SELECT = {
  id: true,
  discordUserId: true,
  productId: true,
  targetPrice: true,
  currency: true,
  enabled: true,
  lastNotifiedAt: true,
  notificationCursorAt: true,
  updatedAt: true,
  product: {
    select: TARGET_PRICE_WATCH_PRODUCT_SELECT,
  },
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

export const TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT = {
  status: true,
  errorMessage: true,
  deliveredAt: true,
  createdAt: true,
} as const satisfies Prisma.DiscordNotificationDeliverySelect;

type TargetPriceWatchProductRecord = Prisma.ProductGetPayload<{
  select: typeof TARGET_PRICE_WATCH_PRODUCT_SELECT;
}>;
type SavedTargetPriceWatchRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_SELECT;
}>;
export type TargetPriceWatchListRecord = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_WATCH_LIST_SELECT;
}>;
export type TargetPriceWatchDeliveryStatus = Prisma.DiscordNotificationDeliveryGetPayload<{
  select: typeof TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT;
}>;

export type CreateTargetPriceWatchResult =
  | {
      status: "invalid_product_reference";
    }
  | {
      status: "invalid_target_price";
    }
  | {
      status: "product_not_found";
      productId: string;
    }
  | {
      status: "watch_limit_reached";
      maxWatches: number;
    }
  | {
      status: "saved";
      product: TargetPriceWatchProductRecord;
      watch: SavedTargetPriceWatchRecord;
      currentPrice: number;
      currency: string;
      capturedAt: Date;
      reached: boolean;
    };

export interface TargetPriceWatchlistResult {
  watches: TargetPriceWatchListRecord[];
  page: number;
  statusFilter: TargetPriceWatchStatusFilter;
  sortKey: TargetPriceWatchSortKey;
  totalCount: number;
  filteredCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export type DisableTargetPriceWatchResult =
  | {
      status: "invalid_reference";
    }
  | {
      status: "not_found";
    }
  | {
      status: "disabled";
      watch: TargetPriceWatchListRecord;
    };

export interface DisableTargetPriceWatchesResult {
  disabledCount: number;
  unavailableCount: number;
}

export type TargetPriceWatchLookupResult =
  | {
      status: "invalid_reference";
    }
  | {
      status: "not_found";
    }
  | {
      status: "found";
      watch: TargetPriceWatchListRecord;
    };

export type UpdateTargetPriceWatchResult =
  | {
      status: "invalid_reference" | "invalid_target_price" | "not_found";
    }
  | {
      status: "updated";
      watch: TargetPriceWatchListRecord;
    };
