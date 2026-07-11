// apps/crawler/src/scripts/ops/shared/time.ts
// 統一 crawler 維運人員可見輸出的台北時間格式；machine log 與 state 仍使用 UTC ISO。

export const TAIPEI_TIME_ZONE = "Asia/Taipei";

const TAIPEI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TAIPEI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// 將維運摘要的主要時間顯示為固定台北年月日與秒數。
export function formatTaipeiDateTime(value: Date): string {
  const parts = new Map(
    TAIPEI_DATE_TIME_FORMATTER.formatToParts(value).map((part) => [part.type, part.value]),
  );

  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")} ${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}`;
}
