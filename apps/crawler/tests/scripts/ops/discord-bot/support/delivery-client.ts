// apps/crawler/tests/scripts/ops/discord-bot/support/delivery-client.ts
// 模擬個人 Discord notification delivery delegate，支援寫入紀錄與查詢最近通知。
import { vi } from "vitest";
import type { TestDiscordNotificationDelivery } from "./data-types";

// 建立可檢查 create / findFirst 呼叫的 in-memory delivery client。
export function createNotificationDeliveryClient(deliveries: TestDiscordNotificationDelivery[]) {
  const deliveryRows = [...deliveries];
  const deliveryCreate = vi.fn(
    async (args: {
      data: Omit<TestDiscordNotificationDelivery, "id" | "createdAt"> & {
        id?: string;
        createdAt?: Date;
      };
    }) => {
      const created: TestDiscordNotificationDelivery = {
        id: args.data.id ?? `delivery-${deliveryRows.length + 1}`,
        createdAt: args.data.createdAt ?? new Date("2026-06-07T00:00:00.000Z"),
        ...args.data,
        productId: args.data.productId ?? null,
        targetPriceWatchId: args.data.targetPriceWatchId ?? null,
        dedupeKey: args.data.dedupeKey ?? null,
        errorCategory: args.data.errorCategory ?? null,
        errorMessage: args.data.errorMessage ?? null,
        httpStatus: args.data.httpStatus ?? null,
        providerErrorCode: args.data.providerErrorCode ?? null,
      };
      deliveryRows.push(created);

      return { id: created.id };
    },
  );
  const deliveryFindFirst = vi.fn(
    async (args: {
      where: {
        discordUserId?: string;
        kind?: TestDiscordNotificationDelivery["kind"];
        targetPriceWatchId?: string;
      };
      select?: Record<string, boolean>;
    }) => {
      const delivery = deliveryRows
        .filter((row) => {
          if (args.where.discordUserId && row.discordUserId !== args.where.discordUserId) {
            return false;
          }

          if (args.where.kind && row.kind !== args.where.kind) {
            return false;
          }

          return (
            !args.where.targetPriceWatchId ||
            row.targetPriceWatchId === args.where.targetPriceWatchId
          );
        })
        .sort((left, right) => {
          return (
            right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
          );
        })[0];

      if (!delivery) {
        return null;
      }

      if (!args.select) {
        return delivery;
      }

      return Object.fromEntries(
        Object.entries(args.select)
          .filter(([, selected]) => selected)
          .map(([key]) => [key, delivery[key as keyof TestDiscordNotificationDelivery]]),
      );
    },
  );

  return {
    create: deliveryCreate,
    findFirst: deliveryFindFirst,
  };
}
