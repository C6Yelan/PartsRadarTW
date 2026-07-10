// apps/web/app/_shared/time.ts
// 統一 web 使用者可見時間為 Asia/Taipei，API 與資料庫時間格式維持不變。

type TaipeiDateInput = Date | string | null | undefined;

interface TaipeiDateTimeParts {
  day: string;
  hour: string;
  minute: string;
  month: string;
  year: string;
}

const TAIPEI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Taipei",
});

// 將時間顯示為固定的台北年月日與時分。
export function formatTaipeiDateTime(value: TaipeiDateInput, fallback = "—"): string {
  const parts = getTaipeiDateTimeParts(value);

  return parts
    ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
    : fallback;
}

// 將時間顯示為價格歷史軸線使用的台北月日。
export function formatTaipeiMonthDay(value: TaipeiDateInput, fallback = ""): string {
  const parts = getTaipeiDateTimeParts(value);

  return parts ? `${parts.month}/${parts.day}` : fallback;
}

// 將時間顯示為價格歷史紀錄與 tooltip 使用的台北月日及時分。
export function formatTaipeiMonthDayTime(value: TaipeiDateInput, fallback = "—"): string {
  const parts = getTaipeiDateTimeParts(value);

  return parts ? `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}` : fallback;
}

function getTaipeiDateTimeParts(value: TaipeiDateInput): TaipeiDateTimeParts | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const values = Object.fromEntries(
    TAIPEI_DATE_TIME_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    day: values.day ?? "",
    hour: values.hour ?? "",
    minute: values.minute ?? "",
    month: values.month ?? "",
    year: values.year ?? "",
  };
}
