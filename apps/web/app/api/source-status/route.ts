import { internalErrorResponse } from "../_shared/responses";
import {
  createGetSourceStatusHandler,
  SOURCE_STATUS_CATEGORY_QUERY,
  type SourceStatusReadClient,
} from "./handler";

export async function GET(): Promise<Response> {
  try {
    const { prisma } = await import("@partsradar/db");
    const client: SourceStatusReadClient = {
      sourceCategory: {
        findMany: () => prisma.sourceCategory.findMany(SOURCE_STATUS_CATEGORY_QUERY),
      },
    };

    return createGetSourceStatusHandler(client)();
  } catch {
    return internalErrorResponse();
  }
}
