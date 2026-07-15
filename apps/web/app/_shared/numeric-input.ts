// apps/web/app/_shared/numeric-input.ts
// 提供跨功能表單共用的純數字輸入清理。

export function toDigitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
