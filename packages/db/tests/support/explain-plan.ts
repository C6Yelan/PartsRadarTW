export interface ExplainPlanNode extends Record<string, unknown> {
  "Actual Loops": number;
  "Actual Rows": number;
  Alias?: string;
  "CTE Name"?: string;
  Filter?: string;
  "Index Name"?: string;
  "Node Type": string;
  "Plan Rows"?: number;
  Plans?: ExplainPlanNode[];
  "Relation Name"?: string;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
}

export function collectPlanNodes(value: unknown): ExplainPlanNode[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectPlanNodes);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const nested = Object.values(record).flatMap(collectPlanNodes);

  return typeof record["Node Type"] === "string" ? [record as ExplainPlanNode, ...nested] : nested;
}

export function walkPlan(root: ExplainPlanNode): ExplainPlanNode[] {
  return [root, ...(root.Plans ?? []).flatMap(walkPlan)];
}

export function rowsExaminedPerLoop(node: Record<string, unknown>): number {
  return (
    Number(node["Actual Rows"]) +
    Number(node["Rows Removed by Filter"] ?? 0) +
    Number(node["Rows Removed by Index Recheck"] ?? 0)
  );
}

export function totalRowsExamined(node: Record<string, unknown>): number {
  return rowsExaminedPerLoop(node) * Number(node["Actual Loops"]);
}

export function totalSharedBuffers(node: Record<string, unknown>): number {
  return Number(node["Shared Hit Blocks"] ?? 0) + Number(node["Shared Read Blocks"] ?? 0);
}
