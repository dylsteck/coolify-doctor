/** Chat SDK uses `telegram:<chatId>` for Telegram; env is usually just the numeric id. */
export function telegramRawChatId(channelId: string): string {
  const prefix = "telegram:";
  if (channelId.startsWith(prefix)) {
    return channelId.slice(prefix.length);
  }
  return channelId;
}

export function isAllowedTelegramChat(channelId: string, allowedChatId: string): boolean {
  return telegramRawChatId(channelId) === allowedChatId.trim();
}
