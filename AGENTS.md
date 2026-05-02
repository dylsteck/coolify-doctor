# AGENTS.md

Guidance for AI agents editing this repo.

## What this is

`coolify-doctor` is a **TypeScript** service (Node 22+, Hono) that:

- **Webhook receiver** — `POST /webhook/:secret`: verifies path secret (constant-time), parses Coolify JSON, formats HTML, sends via Telegram Bot API. Returns `401` only on secret mismatch; otherwise **`200` even on internal errors** so Coolify does not retry aggressively on bugs.
- **Conversational Telegram** — Chat SDK (`chat`, `@chat-adapter/telegram`) with `onNewMention` / `onSubscribedMessage`, optional Redis-backed state, **`@cursor/sdk`** local agents against `AGENT_WORKSPACE`.

There are **no slash commands** in this version; infra questions go through natural language + Cursor.

## Layout

```
src/
  server.ts
  config.ts
  telegram/html.ts
  coolify/event.ts
  coolify/format.ts
  notify/telegram_send_html.ts
  webhook/secrets.ts
  webhook/coolify_webhook.ts
  chat/create_bot.ts
  chat/cursor_bridge.ts
```

Use **snake_case** for **file names** (e.g. `cursor_bridge.ts`, `coolify_webhook.ts`).

## Conventions

- **Module format**: ESM (`"type": "module"`), imports use `.js` extensions pointing at emitted files.
- **HTML for Coolify notifications**: route untrusted strings through `telegram/html.ts` helpers (`esc`, `link`, …) before building parse_mode HTML.
- **Coolify webhook**: never return non-200 to Coolify for JSON/Telegram failures; log and `200`.
- **Telegram chat allowlist**: `create_bot.ts` compares `thread.channelId` to `TELEGRAM_CHAT_ID`. Do not remove without a replacement gate.
- **Cursor agents**: use `Agent.create` / `Agent.resume`, always `await agent[Symbol.asyncDispose]()` in a `finally` (or `await using`). Distinguish `CursorAgentError` (startup) vs `run.wait()` `status === "error"` (run failed).
- **Local agent options**: pass `local: { cwd, settingSources: [] }` for services unless you intentionally want ambient Cursor settings.
- **No unnecessary comments** — only when the why is non-obvious.

## Adding a Coolify webhook event variant

1. Extend `CoolifyEvent` in `src/coolify/event.ts` if new fields are needed (match Coolify JSON keys).
2. Add a branch in `formatEvent` in `src/coolify/format.ts`.
3. Extend `src/coolify/format.test.ts` if useful.

## Running & testing

```bash
npm ci
npm run build
npm test
```

Manual run: set env from `.env`, then `npm start` (after `npm run build`).

## Gotchas

- **Coolify webhooks are unsigned** — path secret is the only auth on `/webhook/:secret`.
- **Telegram webhook** must use the same `secret_token` as `TELEGRAM_WEBHOOK_SECRET_TOKEN`.
- **`REDIS_URL`**: without it, Chat subscriptions and stored `cursorAgentId` are memory-only.
- **Cursor local in Docker** may need extra validation (permissions, CLI/runtime expectations) depending on image and mount.
