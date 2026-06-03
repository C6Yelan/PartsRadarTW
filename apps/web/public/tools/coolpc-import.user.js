// ==UserScript==
// @name         PartsRadarTW CoolPC estimate importer
// @namespace    https://partsradar.net/
// @version      0.1.2
// @description  將 PartsRadarTW 配單帶入原價屋估價頁；不會送出訂單，送出前仍需自行確認。
// @match        https://www.coolpc.com.tw/evaluate.php*
// @match        https://www.coolpc.com.tw/evaluate.php/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://partsradar.net/tools/coolpc-import
// ==/UserScript==

// 這個腳本只會在原價屋估價頁讀取網址中的 PartsRadarTW 配單資料，自動選取對應商品與數量，並顯示匯入結果。
// 腳本不會送出訂單、不會讀取其他網站資料，也不會把資料傳送到 PartsRadarTW 或第三方服務。
// apps/web/public/tools/coolpc-import.user.js

// 啟動匯入流程，避免重複執行並在原價屋估價頁載入後填入配單資料。
(function partsRadarCoolpcImport() {
  const SCRIPT_VERSION = "0.1.2";
  const HASH_PREFIX = "#partsradar=";
  const MAX_WAIT_ATTEMPTS = 80;
  const WAIT_INTERVAL_MS = 250;
  const MAX_RESULT_ROWS = 6;

  if (window.__partsradarCoolpcImportDone) {
    return;
  }

  const payload = readPayloadFromHash();

  if (!payload) {
    return;
  }

  window.__partsradarCoolpcImportDone = true;
  console.info(`PartsRadarTW 原價屋匯入工具 v${SCRIPT_VERSION} 開始執行。`);

  waitForEstimatePage()
    // 估價頁欄位可用後，將配單資料帶入頁面並顯示結果。
    .then(() => {
      showResultPanel(importPayload(payload), SCRIPT_VERSION);
    })
    // 匯入失敗時，顯示可讀的錯誤訊息給使用者。
    .catch((error) => {
      showResultPanel(
        {
          ok: false,
          summary: "匯入工具無法讀取原價屋估價欄位。",
          results: [
            {
              status: "error",
              label: error instanceof Error ? error.message : String(error),
            },
          ],
        },
        SCRIPT_VERSION,
      );
    });

  // 從網址 hash 讀取並驗證 PartsRadarTW 傳來的配單資料。
  function readPayloadFromHash() {
    if (!window.location.hash?.startsWith(HASH_PREFIX)) {
      return null;
    }

    try {
      const rawValue = decodeURIComponent(window.location.hash.slice(HASH_PREFIX.length));
      const candidate = JSON.parse(rawValue);

      if (
        !candidate ||
        candidate.source !== "partsradar" ||
        candidate.v !== 1 ||
        !Array.isArray(candidate.items)
      ) {
        return null;
      }

      const items = candidate.items
        // 將壓縮格式轉成腳本內部使用的商品資料。
        .map((item) => {
          return {
            igrp: Number(item.g),
            token: typeof item.t === "string" ? item.t.trim() : "",
            quantity: clampQuantity(Number(item.q)),
            expectedPrice: Number(item.p),
          };
        })
        // 移除缺少分類或商品代碼的無效項目。
        .filter((item) => {
          return Number.isInteger(item.igrp) && item.igrp > 0 && item.token;
        });

      return items.length ? { items: items } : null;
    } catch {
      return null;
    }
  }

  // 等待原價屋估價頁的商品選單載入完成。
  function waitForEstimatePage() {
    // 建立輪詢流程，直到估價欄位出現或等待逾時。
    return new Promise((resolve, reject) => {
      let attempts = 0;
      // 每隔一小段時間檢查原價屋估價欄位是否已經出現。
      const timer = window.setInterval(() => {
        attempts += 1;

        if (getEstimateContext().pageDocument.querySelector("select[name^='n']")) {
          window.clearInterval(timer);
          resolve();
          return;
        }

        if (attempts >= MAX_WAIT_ATTEMPTS) {
          window.clearInterval(timer);
          reject(new Error("等待欄位逾時"));
        }
      }, WAIT_INTERVAL_MS);
    });
  }

  // 將配單資料寫入原價屋估價頁的商品與數量欄位。
  function importPayload(nextPayload) {
    const seenIgrps = {};
    const results = [];
    const estimateContext = getEstimateContext();

    ensureCoolpcFormAccess(estimateContext);

    // 逐筆處理 PartsRadarTW 配單商品。
    nextPayload.items.forEach((item) => {
      if (seenIgrps[item.igrp]) {
        results.push({
          status: "skipped",
          label: `IGrp ${item.igrp} 重複分類，請手動補上`,
        });
        return;
      }

      seenIgrps[item.igrp] = true;

      const productSelect = getSelect(`n${item.igrp}`, estimateContext);
      const quantitySelect = getSelect(`u${item.igrp}`, estimateContext);

      if (!productSelect || !quantitySelect) {
        results.push({
          status: "missing",
          label: `IGrp ${item.igrp} 找不到估價欄位`,
        });
        return;
      }

      // 在原價屋商品選單中尋找對應的商品代碼。
      const option = Array.from(productSelect.options).find((candidate) => {
        return candidate.value === item.token && !candidate.disabled;
      });

      if (!option) {
        results.push({
          status: "missing",
          label: `IGrp ${item.igrp} 找不到商品代碼 ${item.token}`,
        });
        return;
      }

      productSelect.value = item.token;
      quantitySelect.value = selectQuantity(quantitySelect, item.quantity);
      safeDispatchChange(productSelect, estimateContext);
      safeDispatchChange(quantitySelect, estimateContext);
      runCoolpcCount(item.igrp, estimateContext);

      const officialPrice = parseOptionPrice(option.textContent || "");
      const priceChanged =
        Number.isFinite(item.expectedPrice) &&
        officialPrice !== null &&
        officialPrice !== item.expectedPrice;

      results.push({
        status: priceChanged ? "price-changed" : "selected",
        label: truncate(option.textContent || `IGrp ${item.igrp}`),
        detail: priceChanged
          ? `PartsRadarTW NT$ ${item.expectedPrice}，原價屋目前 NT$ ${officialPrice}`
          : `數量 ${quantitySelect.value}`,
      });
    });

    // 統計成功帶入或價格不同但已選取的商品數。
    const selectedCount = results.filter((result) => {
      return result.status === "selected" || result.status === "price-changed";
    }).length;
    const manualCount = results.length - selectedCount;
    // 統計原價屋目前價格和 PartsRadarTW 記錄價格不同的商品數。
    const priceChangedCount = results.filter((result) => {
      return result.status === "price-changed";
    }).length;

    return {
      ok: selectedCount > 0,
      summary: `已帶入 ${selectedCount} 筆${manualCount ? `，${manualCount} 筆需手動確認` : ""}${
        priceChangedCount ? `，${priceChangedCount} 筆價格不同` : ""
      }`,
      results,
    };
  }

  // 依照欄位名稱取得原價屋估價頁的 select 元素。
  function getSelect(name, estimateContext) {
    const element = estimateContext.pageDocument.getElementsByName(name)[0];

    return element && element.tagName === "SELECT" ? element : null;
  }

  // 選擇最接近且可用的商品數量。
  function selectQuantity(quantitySelect, quantity) {
    const normalizedQuantity = String(clampQuantity(quantity));
    // 優先尋找和配單數量完全一致的選項。
    const exactOption = Array.from(quantitySelect.options).find((option) => {
      return option.value === normalizedQuantity;
    });

    if (exactOption) {
      return exactOption.value;
    }

    const numericOptions = Array.from(quantitySelect.options)
      // 將數量選項轉成可比較的數字。
      .map((option) => {
        return { value: option.value, numberValue: Number(option.value) };
      })
      // 只保留有效數字選項。
      .filter((option) => {
        return Number.isFinite(option.numberValue);
      })
      // 依照數量由小到大排序，方便挑選 fallback。
      .sort((left, right) => {
        return left.numberValue - right.numberValue;
      });
    const fallbackOption =
      // 若沒有完全相同的數量，選擇不超過需求的最大可用數量。
      numericOptions.findLast((option) => {
        return option.numberValue <= quantity;
      }) || numericOptions[numericOptions.length - 1];

    return fallbackOption ? fallbackOption.value : quantitySelect.value;
  }

  // 補上原價屋舊式腳本需要的 S 表單全域別名。
  function ensureCoolpcFormAccess(estimateContext) {
    const pageWindow = estimateContext.pageWindow;
    const pageDocument = estimateContext.pageDocument;
    const form =
      pageDocument.forms.namedItem("S") || pageDocument.querySelector("form[name='S']");

    if (form) {
      pageWindow.S = form;
    }
  }

  // 安全觸發欄位 change 事件，避免原價屋頁內錯誤中斷匯入流程。
  function safeDispatchChange(element, estimateContext) {
    try {
      element.dispatchEvent(new estimateContext.pageWindow.Event("change", { bubbles: true }));
    } catch (error) {
      console.warn("PartsRadarTW 無法觸發原價屋欄位更新。", error);
    }
  }

  // 呼叫原價屋頁面自己的計算函式，更新小計與總價。
  function runCoolpcCount(igrp, estimateContext) {
    const pageWindow = estimateContext.pageWindow;

    if (typeof pageWindow.cnt === "function") {
      try {
        ensureCoolpcFormAccess(estimateContext);
        pageWindow.cnt(igrp);
      } catch (error) {
        console.warn("PartsRadarTW 無法呼叫原價屋總價更新函式。", error);
      }
    }
  }

  // 找到實際顯示估價表單的頁面，原價屋有時會把內容包進 iframe。
  function getEstimateContext() {
    let pageWindow = getPageWindow();
    let pageDocument = pageWindow.document;

    for (let depth = 0; depth < 3; depth += 1) {
      const frame = findVisibleEstimateFrame(pageDocument);

      if (!frame?.contentWindow?.document) {
        break;
      }

      const frameDocument = frame.contentWindow.document;

      if (!frameDocument.querySelector("select[name^='n']")) {
        break;
      }

      pageWindow = frame.contentWindow;
      pageDocument = frameDocument;
    }

    return { pageWindow, pageDocument };
  }

  // 從頁面中找出原價屋目前覆蓋在畫面上的估價 iframe。
  function findVisibleEstimateFrame(pageDocument) {
    return Array.from(pageDocument.querySelectorAll("iframe#mycookie, iframe[src*='eval-mesg.php']")).find(
      (frame) => {
        try {
          const rect = frame.getBoundingClientRect();
          const style = pageDocument.defaultView.getComputedStyle(frame);

          return (
            rect.width > 320 &&
            rect.height > 240 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Boolean(frame.contentDocument?.querySelector("select[name^='n']"))
          );
        } catch {
          return false;
        }
      },
    );
  }

  // 取得實際頁面的 window 物件，讓腳本能呼叫原價屋頁內函式。
  function getPageWindow() {
    return typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  }

  // 在畫面右下角顯示匯入結果與提醒。
  function showResultPanel(result, scriptVersion) {
    const panel = document.createElement("section");
    panel.setAttribute("aria-label", "PartsRadarTW 匯入結果");
    panel.style.position = "fixed";
    panel.style.right = "14px";
    panel.style.bottom = "14px";
    panel.style.zIndex = "2147483647";
    panel.style.boxSizing = "border-box";
    panel.style.width = "min(380px, calc(100vw - 28px))";
    panel.style.padding = "13px";
    panel.style.border = "1px solid #6f8796";
    panel.style.borderRadius = "8px";
    panel.style.background = "#101c24";
    panel.style.boxShadow = "0 16px 42px rgba(0, 0, 0, .42)";
    panel.style.color = "#f3f8fb";
    panel.style.font = "13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    panel.style.pointerEvents = "none";

    const heading = document.createElement("div");
    heading.style.display = "flex";
    heading.style.alignItems = "center";
    heading.style.justifyContent = "space-between";
    heading.style.gap = "12px";

    const title = document.createElement("strong");
    title.textContent = result.ok
      ? `PartsRadarTW 已帶入估價頁 v${scriptVersion}`
      : `PartsRadarTW 匯入未完成 v${scriptVersion}`;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "關閉";
    closeButton.style.minHeight = "28px";
    closeButton.style.border = "1px solid #6f8796";
    closeButton.style.borderRadius = "6px";
    closeButton.style.background = "transparent";
    closeButton.style.color = "#cfe7f5";
    closeButton.style.cursor = "pointer";
    closeButton.style.pointerEvents = "auto";
    // 關閉匯入結果面板。
    closeButton.onclick = () => {
      panel.remove();
    };

    heading.append(title, closeButton);
    panel.append(heading);

    const summary = document.createElement("p");
    summary.textContent = result.summary;
    summary.style.margin = "8px 0 0";
    summary.style.color = "#cfe7f5";
    panel.append(summary);

    const notice = document.createElement("p");
    notice.textContent = "送出前請在原價屋官方頁面確認商品、數量、價格與庫存。";
    notice.style.margin = "6px 0 0";
    notice.style.color = "#a8b7c0";
    panel.append(notice);

    if (result.results.length) {
      const list = document.createElement("ul");
      list.style.display = "grid";
      list.style.gap = "5px";
      list.style.padding = "8px 0 0 18px";
      list.style.margin = "8px 0 0";
      list.style.borderTop = "1px solid rgba(207, 231, 245, .2)";

      // 顯示前幾筆匯入結果，避免面板過長。
      result.results.slice(0, MAX_RESULT_ROWS).forEach((item) => {
        const row = document.createElement("li");
        row.textContent = item.detail ? `${item.label}｜${item.detail}` : item.label;
        row.style.color = item.status === "selected" ? "#dff4e4" : "#ffd89b";
        list.append(row);
      });

      if (result.results.length > MAX_RESULT_ROWS) {
        const row = document.createElement("li");
        row.textContent = `另有 ${result.results.length - MAX_RESULT_ROWS} 筆結果未顯示`;
        row.style.color = "#a8b7c0";
        list.append(row);
      }

      panel.append(list);
    }

    document.body.append(panel);
  }

  // 從原價屋商品選項文字中解析目前價格。
  function parseOptionPrice(text) {
    const match = text.match(/,\s*\$([0-9,]+)/);

    if (!match) {
      return null;
    }

    return Number(match[1].replace(/,/g, ""));
  }

  // 將數量限制在原價屋估價頁可安全處理的 1 到 10 之間。
  function clampQuantity(quantity) {
    if (!Number.isFinite(quantity)) {
      return 1;
    }

    return Math.min(Math.max(Math.trunc(quantity), 1), 10);
  }

  // 將過長的商品名稱縮短，避免結果面板難以閱讀。
  function truncate(value) {
    return value.length > 72 ? `${value.slice(0, 72)}...` : value;
  }
})();
