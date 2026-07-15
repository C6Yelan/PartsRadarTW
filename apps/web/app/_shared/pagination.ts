// apps/web/app/_shared/pagination.ts
// 建立跨功能分頁列共用的可見頁碼與間隔標記。

export function getVisiblePages(currentPage: number, totalPages: number): Array<number | string> {
  if (totalPages <= 1) {
    return [1];
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | string> = [];

  for (const page of sortedPages) {
    const lastItem = items.at(-1);
    if (typeof lastItem === "number" && page - lastItem > 1) {
      items.push(`gap-${lastItem}-${page}`);
    }
    items.push(page);
  }

  return items;
}
