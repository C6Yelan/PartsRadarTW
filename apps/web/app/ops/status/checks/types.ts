// apps/web/app/ops/status/checks/types.ts

import type { OpsStatusLevel } from "../types";

export interface OpsStatusCheck {
  key: string;
  label: string;
  level: OpsStatusLevel;
  message: string;
}
