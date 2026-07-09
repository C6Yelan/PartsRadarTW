"use client";
// apps/web/app/products/[id]/price-history/chart/chart-config.ts
// 提供價格走勢圖的桌面 / 手機 SVG 尺寸設定，讓 chart model 可依 viewport 建立座標。

import { useEffect, useState } from "react";
import type { ChartConfig } from "../types";

const DESKTOP_CHART_CONFIG = {
  width: 640,
  height: 196,
  padding: {
    top: 12,
    right: 24,
    bottom: 30,
    left: 50,
  },
} as const satisfies ChartConfig;

const MOBILE_CHART_CONFIG = {
  width: 300,
  height: 260,
  padding: {
    top: 20,
    right: 22,
    bottom: 36,
    left: 50,
  },
} as const satisfies ChartConfig;

// 依照網站 760px mobile breakpoint 切換 chart config，讓 SVG viewBox 與互動座標同步。
export function useChartConfig() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateChartConfig = () => setIsMobile(mediaQuery.matches);

    updateChartConfig();
    mediaQuery.addEventListener("change", updateChartConfig);

    return () => mediaQuery.removeEventListener("change", updateChartConfig);
  }, []);

  return isMobile ? MOBILE_CHART_CONFIG : DESKTOP_CHART_CONFIG;
}
