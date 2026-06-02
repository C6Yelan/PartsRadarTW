export function formatPrice(amount: number) {
  return `NT$ ${formatInteger(amount)}`;
}

export function formatSignedPrice(amount: number) {
  if (amount === 0) {
    return "NT$ 0";
  }

  return `${amount > 0 ? "+" : "-"}NT$ ${formatInteger(Math.abs(amount))}`;
}

export function formatSignedPercent(percent: number) {
  if (percent === 0) {
    return "0%";
  }

  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

export function formatDateTime(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
