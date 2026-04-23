# coolify-doctor

Thin Go service that receives Coolify webhook notifications and forwards them to a Telegram chat.

V1 is outbound-only: Coolify fires a webhook, we format it, a Telegram bot posts it. Future: Sentinel metrics, `/status` commands, AI chat.

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

### 4. Configure

Copy `.env.example` to `.env` and fill in the four values from the steps above.

### 5. Run locally

```bash
go run .
```

Test without a real Coolify:

```bash
curl -X POST http://localhost:8080/webhook/$WEBHOOK_SECRET \
  -H 'Content-Type: application/json' \
  -d '{"success":true,"event":"deployment_success","message":"Deployment successful","application_name":"test-app","environment":"production","deployment_url":"https://example.com"}'
```

### 6. Deploy on Coolify

Point Coolify at this repo, let it build the Dockerfile. Set the four env vars in the app's Environment Variables, expose port `8080`, give it a domain.

Then in Coolify: **Notifications → Webhook**, set URL to `https://<your-domain>/webhook/<WEBHOOK_SECRET>`, enable the event types you want, hit "Send Test". A `🧪 Test webhook` message should appear in Telegram.

## Routes

- `POST /webhook/{secret}` — Coolify webhook receiver
- `GET /health` — healthcheck (returns `ok`)

## Supported events

All 14 Coolify webhook event types are formatted explicitly: `deployment_success`, `deployment_failed`, `status_changed`, `backup_success`, `backup_failed`, `task_success`, `task_failed`, `docker_cleanup_success`, `docker_cleanup_failed`, `server_disk_usage`, `server_reachable`, `server_unreachable`, `server_patch`, `traefik_version_outdated`, plus `test`. Unknown events fall back to a generic message with the raw payload, so nothing is silently dropped.
