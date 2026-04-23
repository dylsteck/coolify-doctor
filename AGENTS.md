# AGENTS.md

Guidance for AI agents editing this repo.

## What this is

`coolify-doctor` is a thin Go service that receives outbound webhook notifications from a Coolify instance and forwards them to a Telegram chat via a bot. V1 is outbound-only (no update polling, no commands, no AI).

## Layout

Flat, two Go files. Keep it that way unless a feature genuinely needs a package boundary.

- `main.go` — env loading, `bot.New(..., bot.WithSkipGetMe())`, `http.ServeMux` with Go 1.22+ path patterns, `ListenAndServe`. The `send func(string)` closure is the seam between the HTTP layer and Telegram — tests and future features should inject through it.
- `webhook.go` — `Event` struct (superset of all Coolify payloads), `handleWebhook` HTTP handler, `formatEvent` switch, small HTML helpers.
- `Dockerfile` — multi-stage, `golang:1.25-alpine` → `alpine:3.20`, has a `HEALTHCHECK` hitting `/health`.

## Conventions

- **Go version**: 1.25.x (go.mod). The `ServeMux` pattern syntax (`"POST /webhook/{secret}"`, `r.PathValue(...)`) requires 1.22+.
- **Dependencies**: only `github.com/go-telegram/bot`. Don't pull in a router (chi/gin/echo) — the stdlib mux covers our needs.
- **HTML parse mode**: all messages use `models.ParseModeHTML`. Always route user-supplied strings through `esc(...)` before concatenating into message text. URLs use `html.EscapeString` in the `link(...)` helper.
- **Error handling philosophy**: return 200 to Coolify on our own failures (bad JSON, Telegram API errors) and log. Coolify retries aggressively — we don't want retry storms on bugs in our formatting. Only return 401 on a bad path secret.
- **No comments explaining what code does.** Only the `Event` struct has a doc comment because the "one giant struct vs. per-event structs" choice is non-obvious.

## Adding a new event formatter

Coolify webhook payloads all conform to `{ success, message, event, ...event-specific }`. To format a new event:

1. If it has new fields, add them to the `Event` struct in `webhook.go` with `json:"...,omitempty"` tags.
2. Add a `case "your_event":` branch to `formatEvent`. Use the existing helpers (`joinLines`, `appLine`, `dbLine`, `serverLine`, `link`, `esc`, `truncate`).
3. Smoke-test via the curl pattern in the verification script below.

The unknown-event fallback already surfaces the raw payload inside `<pre>`, so unsupported events aren't silently dropped — they just look uglier.

## Running & testing locally

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... WEBHOOK_SECRET=dev go run .
curl -X POST http://localhost:8080/webhook/dev \
  -H 'Content-Type: application/json' \
  -d '{"success":true,"event":"deployment_success","message":"ok","application_name":"demo","environment":"prod","deployment_url":"https://example.com"}'
```

Before committing: `go build ./... && go vet ./... && go mod tidy`.

There are no unit tests yet. If you add logic beyond formatting, add tests for it — the formatter itself is table-testable via `formatEvent(ev, raw)`.

## Roadmap (in order)

1. **Sentinel metrics polling** — hit `http://coolify-sentinel:8888/api/...` from inside the Coolify Docker network on a ticker; publish threshold alerts through the same `send` closure. New file: `sentinel.go`. New env: `SENTINEL_TOKEN`, `SENTINEL_URL` (defaults to `http://coolify-sentinel:8888`).
2. **Telegram command handling** — switch from "create bot and call SendMessage" to `bot.New(token, bot.WithDefaultHandler(...))` + `b.Start(ctx)`. Register `/status`, `/logs <app>`, `/restart <app>` via `b.RegisterHandler`. Needs Coolify API token (`COOLIFY_URL`, `COOLIFY_TOKEN`) to call `GET /v1/servers/{uuid}/resources` etc.
3. **AI chat** — add `ANTHROPIC_API_KEY`, wire Anthropic SDK call from a `/ask` command scoped to infra context (recent events, current resources, Sentinel metrics).

Each layer is additive — the webhook receiver shouldn't need to change to add them.

## Gotchas

- **Coolify webhooks are unsigned.** The path secret (`/webhook/{secret}`) is our only auth. Don't accept the same payload on any other route without equivalent gating.
- **`ChatID` is `any`** in `SendMessageParams`. We pass `int64`. If you ever want to support channel usernames (`@channelname`), pass a string instead.
- **`bot.WithSkipGetMe()` means a bad token won't fail at startup** — it'll fail on the first `SendMessage` call. Acceptable tradeoff for faster boot and cleaner logs when Telegram is flaky.
- **Body size limit**: `http.MaxBytesReader(w, r.Body, 1<<20)` caps payload at 1 MiB. Coolify payloads are small (~1 KB), but error_output / task output could be larger. Bump if you see truncation in logs.
- **Images & emoji in strings** are bytes, not runes — `truncate` uses byte-length slicing so it can cut mid-rune. Fine in practice since everything ends up in `<pre>`, but if you ever format without `<pre>`, switch to rune-aware truncation.
