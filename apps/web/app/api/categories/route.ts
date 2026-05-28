import { internalErrorResponse } from "../_shared/responses";
import { createGetCategoriesHandler } from "./handler";

export async function GET(): Promise<Response> {
  try {
    const { prisma } = await import("@partsradar/db");

    return createGetCategoriesHandler(prisma)();
  } catch {
    return internalErrorResponse();
  }
}
