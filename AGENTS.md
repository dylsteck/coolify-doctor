# AGENTS.md

Guidance for AI agents editing this repo.

## What this is

`coolify-doctor` is a **TypeScript** service (Node 22+, Hono) that:

- **Webhook receiver** — `POST /webhook/:secret`: verifies path secret (constant-time), parses Coolify JSON, formats HTML, sends via Telegram Bot API. Returns `401` only on secret mismatch; otherwise **`200` even on internal errors** so Coolify does not retry aggressively on bugs.
- **Conversational Telegram** — Chat SDK (`chat`, `@chat-adapter/telegram`) with `onNewMention`, `onDirectMessage`, `onSubscribedMessage`, Redis-backed state, **`@cursor/sdk`** local agents against `AGENT_WORKSPACE` (`CURSOR_MODEL_ID` in `cursor/models.ts`, grounding in `cursor_bridge.ts`). `renew_typing.ts` refreshes typing during long runs. User messages **`help`**, **`clear`** (reset thread state via `setState({}, { replace: true })`), **`stop`** (unsubscribe) are handled in `create_bot.ts` before Cursor runs.
- **Coolify webhook insight** — After `formatEvent`, `webhook_cursor_insight.ts` runs a one-shot `Agent.prompt` (`auto` then `composer-2.5` fallback) for a short plain-text note appended to the Telegram HTML. Failures are logged; webhook still returns `200` with the base formatted message.

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
  chat/renew_typing.ts
  chat/*.test.ts
  mcp/coolify_api.ts
  mcp/coolify_sentinel_mcp.ts
  mcp/for_agent.ts
```

Use **snake_case** for **file names** (e.g. `cursor_bridge.ts`, `coolify_webhook.ts`).

## Conventions

- **Module format**: ESM (`"type": "module"`), imports use `.js` extensions pointing at emitted files.
- **HTML for Coolify notifications**: route untrusted strings through `telegram/html.ts` helpers (`esc`, `link`, …) before building parse_mode HTML.
- **Coolify webhook**: never return non-200 to Coolify for JSON/Telegram failures; log and `200`.
- **Telegram chat allowlist**: Chat SDK uses `telegram:<chatId>` while env is usually a bare id — `telegram_allowlist.ts` normalizes before compare.
- **Cursor agents**: use `Agent.create` / `Agent.resume`, always `await agent[Symbol.asyncDispose]()` in a `finally` (or `await using`). Distinguish `CursorAgentError` (startup) vs `run.wait()` `status === "error"` (run failed).
- **Local agent options**: pass `local: { cwd, settingSources: [] }` for services unless you intentionally want ambient Cursor settings. Pass **`mcpServers`** again on **`Agent.resume`** when using MCP (see `buildMcpServersForAgent` in `src/mcp/for_agent.ts`).
- **Infra MCP**: `src/mcp/coolify_sentinel_mcp.ts` is a stdio MCP entry; tools are read-only. Optional env: `COOLIFY_API_ORIGIN`, `COOLIFY_API_TOKEN`, `SENTINEL_BASE_URL`, `SENTINEL_TOKEN` (see `src/config.ts`). **Do not** add deploy/start/stop tools without product approval and an explicit Telegram/admin gate; prefer **read-only** Coolify API tokens.
- **Vercel AI SDK / `cursor-ai-sdk-provider`**: not used; stay on **`@cursor/sdk`** directly unless a stable provider adds clear value (see roadmap note in plan).
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
- **Redis**: `docker/entrypoint.sh` always starts Redis on `127.0.0.1:6379` before Node. `create_bot.ts` uses `createRedisState({ url: "redis://127.0.0.1:6379" })`. For local `npm start`, run Redis on that address (see README).
- **Cursor local in Docker** may need extra validation (permissions, CLI/runtime expectations) depending on image and mount.
- **Dockerfile** runtime stage installs **`git`** (HTTPS clone). Wide **`AGENT_WORKSPACE`** bind mounts mean **high trust** in who can chat with the bot (`TELEGRAM_CHAT_ID`); Coolify does not always expose read-only mounts — operational risk, not something this repo can enforce from code alone.
