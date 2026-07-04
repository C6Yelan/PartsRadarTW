// apps/crawler/tests/scripts/ops/discord-bot/support-delivery-client.ts
import { vi } from "vitest";
import type { TestDiscordNotificationDelivery } from "./support-data";

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
