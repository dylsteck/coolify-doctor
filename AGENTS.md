# AGENTS.md

Guidance for AI agents editing this repo.

## What this is

`coolify-doctor` is a small Go service that connects Coolify to a Telegram bot:

- **Webhook receiver** — forwards Coolify's outbound notifications into a Telegram chat.
- **Read-only slash commands** — `/projects`, `/resources [project]`, `/usage [timeframe]`.

No write/mutation actions. No AI.

## Layout

```
main.go                         # assembly only; < 60 lines
internal/
  config/config.go              # Load() from env
  coolify/
    client.go                   # REST client: ListProjects, ListResources
    sentinel.go                 # Sentinel client: History / Latest
    event.go                    # Coolify webhook Event struct (payload shape)
  telegram/
    bot.go                      # NewBot, chatGate middleware, default help handler
    commands.go                 # /projects, /resources, /usage handlers
    html.go                     # Esc, Link, JoinLines, JoinInline, Truncate, PrettyEvent
    send.go                     # Sender wrapper for outbound webhook forwarding
  webhook/
    handler.go                  # POST /webhook/{secret}
    format.go                   # formatEvent switch (all 14 Coolify event types)
```

Dependency graph (no cycles): `webhook → coolify + telegram`; `telegram/commands → coolify + telegram/html`; `coolify` has no internal deps.

## Conventions

- **Go version**: 1.25.x. `ServeMux` path patterns (`"POST /webhook/{secret}"`, `r.PathValue(...)`) require 1.22+.
- **Dependencies**: only `github.com/go-telegram/bot`. No router — stdlib mux is enough.
- **HTML parse mode everywhere**: always route untrusted strings through `telegram.Esc(...)` before concatenating into message text. URL hrefs go through `telegram.Link(...)` which escapes them too.
- **Error handling**: return 200 to Coolify on our own failures (bad JSON, Telegram API errors) and log. Coolify retries aggressively; we don't want retry storms on our bugs. Only return 401 on a bad path secret.
- **Command handlers**: every command checks whether its dependencies (Coolify client, Sentinel client) are configured and replies with an inline "not configured" message if not. Never panic, never silently drop.
- **No unnecessary comments.** Only write a comment when the *why* is non-obvious — hidden constraint, subtle invariant, workaround.

## Adding a new read-only command

1. Add a method to `(*Handlers)` in `internal/telegram/commands.go`.
2. Register it in `(*Handlers).Register(b)`.
3. If it needs a new Coolify endpoint, add a thin method on `coolify.Client` in `internal/coolify/client.go`.
4. Use the shared `telegram.Esc`, `telegram.JoinLines`, `telegram.Link` helpers so formatting is consistent with the webhook formatter.
5. Add a line to the Commands table in `README.md` and (optionally) update the `/setcommands` list there.

Do *not* add write actions (restart, stop, redeploy) without explicit product approval — the whole surface is scoped to information, not control.

## Adding a new webhook event

1. If it has new fields, add them to `coolify.Event` in `internal/coolify/event.go` with `json:"...,omitempty"` tags.
2. Add a `case "your_event":` branch to `Format` in `internal/webhook/format.go` using the `telegram` helpers.
3. The unknown-event fallback already surfaces the raw payload inside `<pre>`, so untouched events aren't silently dropped — they just look uglier.

## Running & testing

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... WEBHOOK_SECRET=dev go run .
curl -X POST http://localhost:8080/webhook/dev \
  -H 'Content-Type: application/json' \
  -d '{"success":true,"event":"deployment_success","message":"ok","application_name":"demo","environment":"prod","deployment_url":"https://example.com"}'
```

Before committing: `go build ./... && go vet ./...`.

No tests yet. If you add non-trivial logic (beyond formatting), add a `_test.go` alongside. `webhook.Format` and `telegram.parseTimeframe` are both table-testable and good first targets.

## Gotchas

- **Coolify webhooks are unsigned.** The path secret (`/webhook/{secret}`) is our only auth — compared in constant time via `crypto/subtle`.
- **`bot.WithSkipGetMe()` means a bad token won't fail at startup.** The first call to `SendMessage` or `getUpdates` will log an error instead. Acceptable trade for faster boot and not crashing on transient Telegram issues.
- **`Sentinel.History` accepts multiple JSON shapes** because Sentinel's response format has shifted across versions (`time`/`timestamp`/`t`, `value`/`percent`/`v`). If you extend it, keep that tolerance.
- **Body size limit on webhook**: `http.MaxBytesReader(w, r.Body, 1<<20)`. Coolify payloads are small (~1 KB), but `error_output` / `output` fields can balloon. Bump if you see truncation in logs.
- **Commands run in goroutines** (the bot library handles this) — don't share mutable state between command invocations.
- **`chatGate` middleware drops any update not from `TELEGRAM_CHAT_ID`.** Do not remove it without adding an equivalent check — otherwise anyone who guesses the bot username can probe the Coolify infra.

## Roadmap

1. **Proactive Sentinel alerts** — add a ticker goroutine in `main.go` that polls `sentinel.Latest` every N seconds and calls `sender.SendHTML` on threshold breach. Threshold config via new env (`CPU_THRESHOLD`, `MEM_THRESHOLD`).
2. **`/logs <app>`** — still read-only, GET `/api/v1/applications/{uuid}/logs`, tail the last ~50 lines inside `<pre>`.
3. **Multi-server `/usage`** — accept `SENTINEL_TOKENS=server1:token1,server2:token2`, hit each Sentinel, label output.
4. **AI chat** — a `/ask` command that pipes Sentinel + resources + recent events into Anthropic's API as context. Add `ANTHROPIC_API_KEY`. Still read-only — no tool use that mutates.

Each step is additive and does not require touching the webhook receiver.
