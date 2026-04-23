# coolify-doctor

Thin Go service that connects Coolify to a Telegram bot.

- **Inbound webhook receiver** — Coolify fires a webhook, we format it, the bot posts it into a chat.
- **Read-only slash commands** — `/projects`, `/resources [project]`, `/usage [timeframe]`. No writes, no mutations; purely for checking state.

All commands only answer the configured `TELEGRAM_CHAT_ID`. Commands degrade gracefully when their dependencies aren't configured (e.g. `/usage` replies "Sentinel not configured" if `SENTINEL_TOKEN` is unset).

## Setup

### 1. Create a Telegram bot (`TELEGRAM_BOT_TOKEN`)

Message [@BotFather](https://t.me/BotFather), run `/newbot`, follow the prompts, copy the token he gives you (looks like `123456789:ABCdefGhIJKlmNOpqrsTUVwxyz`). That's your `TELEGRAM_BOT_TOKEN`.

### 2. Get your chat ID (`TELEGRAM_CHAT_ID`)

The numeric ID of the chat the bot should post into.

1. Start a chat with your new bot (or add it to a group/channel and make it admin).
2. Send any message in that chat so it shows up in the bot's update queue.
3. Open this URL in your browser, replacing `<TOKEN>` with your bot token:

   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```

4. Find `"chat":{"id": …}` in the JSON response. That number is your `TELEGRAM_CHAT_ID`.
   - DMs are positive (`123456789`)
   - Groups/channels are negative, usually starting with `-100`

Alternative: forward a message from the target chat to [@JsonDumpBot](https://t.me/JsonDumpBot) and copy `chat.id`.

### 3. Generate a webhook secret (`WEBHOOK_SECRET`)

Coolify doesn't sign its outbound webhooks, so the path secret is the only thing gating this endpoint. Make it long and random:

```bash
openssl rand -base64 32 | tr -d '=+/' | cut -c1-43
```

Use the output verbatim — it's URL-safe so it drops straight into the webhook URL path.

### 4. (Optional) Enable `/projects` and `/resources`

In Coolify, go to **Keys & Tokens → API tokens**, create a token with `read` ability, copy it. Set:

- `COOLIFY_URL` — your Coolify instance URL (e.g. `https://coolify.example.com`)
- `COOLIFY_API_TOKEN` — the token you just created

Without these, `/projects` and `/resources` reply "Coolify API not configured" — the webhook receiver still works.

### 5. (Optional) Enable `/usage`

Open your server's settings in Coolify, go to **Sentinel**, copy the token. Set:

- `SENTINEL_TOKEN` — the server's sentinel token
- `SENTINEL_URL` — optional, defaults to `http://coolify-sentinel:8888` (correct when this service runs on the Coolify Docker network)

### 6. Configure

Copy `.env.example` to `.env` and fill in the values from the steps above.

### 7. Run locally

```bash
go run .
```

Test without a real Coolify:

```bash
curl -X POST http://localhost:8080/webhook/$WEBHOOK_SECRET \
  -H 'Content-Type: application/json' \
  -d '{"success":true,"event":"deployment_success","message":"Deployment successful","application_name":"test-app","environment":"production","deployment_url":"https://example.com"}'
```

### 8. Deploy on Coolify

Point Coolify at this repo, let it build the Dockerfile. Set the env vars in the app's Environment Variables, set **Ports Exposes** to `8080`, give it a domain.

Then in Coolify: **Notifications → Webhook**, set URL to `https://<your-domain>/webhook/<WEBHOOK_SECRET>`, enable the event types you want, hit "Send Test". A `🧪 Test webhook` message should appear in Telegram.

### 9. (Optional) Register commands with BotFather

So Telegram shows autocomplete for your commands, open [@BotFather](https://t.me/BotFather), run `/setcommands`, choose your bot, and paste:

```
projects - list all projects
resources - list resources across projects or one (/resources casterscan)
usage - server CPU / memory / disk (/usage 5m)
```

## Commands

All read-only. Only respond to messages from `TELEGRAM_CHAT_ID`.

| Command | Behavior |
|---|---|
| `/projects` | Lists every project on the Coolify instance. |
| `/resources` | Lists every resource (app / db / service), grouped by project. |
| `/resources <name>` | Filters to the project whose name matches `<name>` (case-insensitive, exact). |
| `/usage` | Current CPU / memory / disk from Sentinel (last 1 minute). |
| `/usage <timeframe>` | Same, over a window. Supported: `1m`, `5m`, `15m`, `1h`, `6h`, `24h`. Unknown values get an error with the supported list. |

Any other text gets a short help message listing these commands.

## Routes

- `POST /webhook/{secret}` — Coolify webhook receiver
- `GET /health` — healthcheck (returns `ok`)

## Supported webhook events

All 14 Coolify webhook event types are formatted explicitly: `deployment_success`, `deployment_failed`, `status_changed`, `backup_success`, `backup_failed`, `task_success`, `task_failed`, `docker_cleanup_success`, `docker_cleanup_failed`, `server_disk_usage`, `server_reachable`, `server_unreachable`, `server_patch`, `traefik_version_outdated`, plus `test`. Unknown events fall back to a generic message with the raw payload, so nothing is silently dropped.

## Layout

```
main.go                         # wire-up only
internal/
  config/                       # env loader
  coolify/                      # REST client + Sentinel client + webhook event type
  telegram/                     # bot init, middleware, commands, shared HTML helpers
  webhook/                      # POST /webhook handler + formatter
```

See `AGENTS.md` for conventions and how to extend.
