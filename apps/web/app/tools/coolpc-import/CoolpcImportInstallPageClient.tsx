"use client";
// apps/web/app/tools/coolpc-import/CoolpcImportInstallPageClient.tsx

import { useState } from "react";
import { COOLPC_IMPORT_USER_SCRIPT_PATH } from "../../build-list/coolpc-import";

const TAMPERMONKEY_CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo";

type ScriptActionState = "idle" | "copied" | "shown" | "error";

export default function CoolpcImportInstallPageClient() {
  const [scriptText, setScriptText] = useState("");
  const [actionState, setActionState] = useState<ScriptActionState>("idle");

  async function loadScriptText() {
    const response = await fetch(COOLPC_IMPORT_USER_SCRIPT_PATH);

    if (!response.ok) {
      throw new Error("Failed to load userscript.");
    }

    return response.text();
  }

  async function copyScript() {
    try {
      const text = scriptText || (await loadScriptText());

      setScriptText(text);
      await navigator.clipboard.writeText(text);
      setActionState("copied");
    } catch {
      setActionState("error");
    }
  }

  async function showScript() {
    try {
      const text = scriptText || (await loadScriptText());

      setScriptText(text);
      setActionState("shown");
    } catch {
      setActionState("error");
    }
  }

  return (
    <div className="tool-install-workspace">
      <section className="tool-install-actions" aria-labelledby="tool-install-actions-title">
        <div>
          <h2 id="tool-install-actions-title">安裝方式</h2>
          <p>依序完成下方兩個安裝按鈕。</p>
        </div>

        <div className="tool-install-action-grid">
          <a
            className="control-button secondary"
            href={TAMPERMONKEY_CHROME_EXTENSION_URL}
            rel="noreferrer"
            target="_blank"
          >
            安裝 Tampermonkey 擴充功能
          </a>
          <a
            className="control-button primary"
            href={COOLPC_IMPORT_USER_SCRIPT_PATH}
            rel="noreferrer"
            target="_blank"
          >
            安裝 PartsRadarTW 匯入工具
          </a>
        </div>
      </section>

      <section className="tool-install-steps" aria-label="安裝步驟">
        <ol>
          <li>
            <strong>安裝 userscript 管理器</strong>
            <span>請從 Chrome Web Store 安裝 Tampermonkey。</span>
          </li>
          <li>
            <strong>開啟必要權限</strong>
            <span>若 Chrome 要求，請到擴充功能詳細資料開啟 Allow User Scripts。</span>
          </li>
          <li>
            <strong>安裝匯入工具</strong>
            <span>按上方安裝按鈕，看到管理器的安裝畫面後確認安裝。</span>
          </li>
          <li>
            <strong>回到配單使用</strong>
            <span>從配單按「帶入原價屋估價頁」，在原價屋官方頁面確認後再送出。</span>
          </li>
        </ol>
      </section>

      <section className="tool-install-fallback" aria-labelledby="tool-install-fallback-title">
        <div>
          <h2 id="tool-install-fallback-title">Chrome 仍然阻擋時</h2>
          <p>改用手動安裝：複製腳本內容，貼到 userscript 管理器的新腳本頁面後儲存。</p>
        </div>

        <div className="tool-install-fallback-actions">
          <button className="control-button secondary" type="button" onClick={copyScript}>
            複製腳本
          </button>
          <button className="control-button secondary" type="button" onClick={showScript}>
            顯示腳本
          </button>
        </div>

        {actionState !== "idle" ? (
          <p className={`tool-install-status ${actionState}`}>
            {getActionStatusText(actionState)}
          </p>
        ) : null}

        {scriptText ? (
          <textarea
            className="tool-install-script"
            readOnly
            value={scriptText}
            aria-label="PartsRadarTW 匯入工具腳本內容"
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : null}
      </section>
    </div>
  );
}

function getActionStatusText(actionState: ScriptActionState) {
  switch (actionState) {
    case "copied":
      return "已複製腳本內容。";
    case "shown":
      return "已顯示腳本內容，可全選後貼到 userscript 管理器。";
    case "error":
      return "無法讀取或複製腳本，請稍後重試。";
    case "idle":
      return "";
  }
}
