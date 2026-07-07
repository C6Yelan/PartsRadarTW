// apps/crawler/src/scripts/ops/discord-bot/message-text.ts
// 提供 Discord 訊息共用文字正規化，移除控制字元並依欄位限制裁切。

// 將輸入文字整理成可放進 Discord payload 的安全長度字串。
export function formatDiscordBotText(value: string, maxLength: number): string {
  const text = replaceControlCharacters(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

// 保留換行與常見空白，但替換不可見控制字元，避免破壞 Discord 顯示或 payload。
function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    const isControlCharacter = (code >= 0 && code <= 31) || code === 127;

    return isControlCharacter && !isAllowedWhitespace ? " " : character;
  }).join("");
}
