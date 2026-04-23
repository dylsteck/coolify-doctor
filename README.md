# coolify-doctor

Thin Go service that receives Coolify webhook notifications and forwards them to a Telegram chat.

V1 is outbound-only: Coolify fires a webhook, we format it, a Telegram bot posts it. Future: Sentinel metrics, `/status` commands, AI chat.

## Setup

### 1. Create a Telegram bot

1. Message [@BotFather](https://t.me/BotFather), run `/newbot`, grab the token.
2. Start a chat with your new bot (or add it to a group/channel and make it admin).
3. Get your chat ID — forward any message from the target chat to [@JsonDumpBot](https://t.me/JsonDumpBot) and copy `chat.id`.

### 2. Configure

Copy `.env.example` to `.env` and fill in the four values. `WEBHOOK_SECRET` should be a long random string — it's the only thing gating the webhook endpoint.

### 3. Run locally

```bash
go run .
```

Test without a real Coolify:

```bash
curl -X POST http://localhost:8080/webhook/$WEBHOOK_SECRET \
  -H 'Content-Type: application/json' \
  -d '{"success":true,"event":"deployment_success","message":"Deployment successful","application_name":"test-app","environment":"production","deployment_url":"https://example.com"}'
```

### 4. Deploy on Coolify

Point Coolify at this repo, let it build the Dockerfile. Set the four env vars in the app's Environment Variables, expose port `8080`, give it a domain.

Then in Coolify: **Notifications → Webhook**, set URL to `https://<your-domain>/webhook/<WEBHOOK_SECRET>`, enable the event types you want, hit "Send Test". A `🧪 Test webhook` message should appear in Telegram.

## Routes

- `POST /webhook/{secret}` — Coolify webhook receiver
- `GET /health` — healthcheck (returns `ok`)

## Supported events

All 14 Coolify webhook event types are formatted explicitly: `deployment_success`, `deployment_failed`, `status_changed`, `backup_success`, `backup_failed`, `task_success`, `task_failed`, `docker_cleanup_success`, `docker_cleanup_failed`, `server_disk_usage`, `server_reachable`, `server_unreachable`, `server_patch`, `traefik_version_outdated`, plus `test`. Unknown events fall back to a generic message with the raw payload, so nothing is silently dropped.
