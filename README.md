# coolify-doctor

Lightweight **Node.js / TypeScript** service that:

1. **Receives Coolify webhooks** — formats events as Telegram HTML and posts them with the Bot API (same behavior as before: always `200` to Coolify except a bad path secret → `401`).
2. **Runs a conversational Telegram bot** via [Vercel Chat SDK](https://chat-sdk.dev/) (`chat` + `@chat-adapter/telegram`). Mention the bot to start a thread; follow-ups go to the Cursor agent. Say `stop` to unsubscribe the thread.

Coolify notifications **do not** go through Chat SDK or Redis — only the direct `sendMessage` path — so deploy alerts keep working even if conversational subsystems fail.

Conversational replies use **`@cursor/sdk`** with the **local** runtime and `AGENT_WORKSPACE` as `cwd` (typically a bind-mounted host directory). You are responsible for what that filesystem can access.

Only the configured **`TELEGRAM_CHAT_ID`** is allowed for the Chat bot (same idea as the old `chatGate`). Use the numeric id as before (e.g. `123456789` or `-100…` for groups); the app strips the `telegram:` prefix that the Chat SDK adds.

**Groups:** first message should **@mention** the bot. **Private DMs:** you can write normally; the bot uses the Chat SDK `onDirectMessage` path for the first message.

## Requirements

- **Node 22+** (local or Docker)
- **Coolify**: webhook URL and secret path segment
- **Telegram**: bot token, bot **username** (for mentions), chat id, webhook secret token
- **Cursor**: API key (`CURSOR_API_KEY`)
- **Workspace**: directory path inside the container (`AGENT_WORKSPACE`), usually a volume mount

**Redis:** the Docker image **always starts a small Redis on `127.0.0.1:6379`** inside the container (not published to a host port). It only holds Chat SDK metadata (thread subscriptions, stored `cursorAgentId`); data is **not** written to disk, so a **full container recreate** clears that state.

**Runtime image** includes **`git`** (and CA certs) so Cursor agents can clone over **HTTPS** into `AGENT_WORKSPACE`. SSH clones need extra setup (not in the image by default).

Repository: [github.com/dylsteck/coolify-doctor](https://github.com/dylsteck/coolify-doctor).

## Setup

### 1. Telegram bot (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`)

Create a bot with [@BotFather](https://t.me/BotFather). The **username** (without `@`) must match `TELEGRAM_BOT_USERNAME` so mentions resolve.

### 2. Chat ID (`TELEGRAM_CHAT_ID`)

Same as before: numeric id of the chat where notifications and bot replies should go. Use `getUpdates` or [@JsonDumpBot](https://t.me/JsonDumpBot) (see older docs in git history if needed).

### 3. Path secret (`WEBHOOK_SECRET`)

Long random string. Coolify webhook URL: `https://<host>/webhook/<WEBHOOK_SECRET>`.

### 4. Telegram webhook secret (`TELEGRAM_WEBHOOK_SECRET_TOKEN`)

Telegram sends this as `X-Telegram-Bot-Api-Secret-Token`. Set it to a long random value and use the **same** value when calling `setWebhook`.

Register the webhook (replace placeholders):

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"https://<your-public-host>/webhooks/telegram\",
    \"secret_token\": \"$TELEGRAM_WEBHOOK_SECRET_TOKEN\"
  }"
```

### 5. Cursor (`CURSOR_API_KEY`, `AGENT_WORKSPACE`)

Use a [Cursor API key](https://cursor.com/docs/sdk/typescript) (user or team service account). `AGENT_WORKSPACE` is the directory passed to `local.cwd` for the agent (e.g. `/workspace` in Docker with a volume mount).

### 6. Configure

Copy `.env.example` to `.env` and fill values.

## Run locally

Chat state expects **Redis on `127.0.0.1:6379`** (same as the container). Quick option:

```bash
docker run -d --name coolify-doctor-redis -p 6379:6379 redis:7-alpine
```

Then:

```bash
npm ci
npm run build
export $(grep -v '^#' .env | xargs)
npm start
```

Test Coolify webhook path:

```bash
curl -X POST "http://localhost:8080/webhook/$WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"success":true,"event":"deployment_success","message":"ok","application_name":"demo","environment":"prod","deployment_url":"https://example.com"}'
```

For Telegram **polling** instead of a public HTTPS URL:

```bash
TELEGRAM_ADAPTER_MODE=polling npm start
```

(Delete the bot webhook first if you previously set one.)

## Docker

Build and run (example bind-mount for the agent workspace):

```bash
docker build -t coolify-doctor .
docker run --rm -p 8080:8080 \
  --env-file .env \
  -v /path/on/host/workspace:/workspace \
  -e AGENT_WORKSPACE=/workspace \
  coolify-doctor
```

The container entrypoint starts **Redis** then runs **Node as user `node`**.

### Coolify: agent workspace on the host

Under **Configuration → Persistent Storage → Storages**, add a **Directory Mount**: **host path** (e.g. `/` or a subfolder) → **container path** (e.g. `/workspace/host`). Set **`AGENT_WORKSPACE`** to that **container** path. Coolify may not offer a read-only toggle; treat a wide mount as high trust (anyone who can use the bot in `TELEGRAM_CHAT_ID` can drive the agent against that tree).

Ensure `TELEGRAM_ADAPTER_MODE=webhook` and your public URL routes `POST /webhooks/telegram` to the container.

**Note:** Local Cursor agents inside the container need a working Cursor local runtime (network, permissions on `AGENT_WORKSPACE`). Validate in your environment before relying on production traffic.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check (`ok`) |
| `POST` | `/webhook/:secret` | Coolify notifications → Telegram HTML |
| `POST` | `/webhooks/telegram` | Telegram updates (Chat SDK) |

## Supported Coolify webhook events

Same set as the legacy formatter: `deployment_success`, `deployment_failed`, `status_changed`, backups, tasks, server events, Traefik outdated, docker cleanup, `test`. Unknown events include a truncated raw payload in `<pre>`.

## Layout

```
src/
  server.ts                 # Hono: health, Coolify webhook, Telegram webhook
  config.ts                 # env (zod)
  telegram/html.ts          # Esc, link, joinLines, …
  coolify/event.ts          # webhook payload shape
  coolify/format.ts         # Coolify → Telegram HTML
  notify/telegram_send_html.ts
  webhook/secrets.ts
  webhook/coolify_webhook.ts
  chat/create_bot.ts        # Chat SDK + Telegram adapter + handlers
  chat/cursor_bridge.ts     # Agent.create / resume, stream to thread (model: composer-1.5)
  chat/renew_typing.ts      # Refresh Telegram typing while Cursor runs
```

See [AGENTS.md](AGENTS.md) for conventions and extension notes.
