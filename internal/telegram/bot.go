package telegram

import (
	"context"
	"log"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

// NewBot constructs a bot that only responds to messages from allowedChatID.
// Skips the GetMe startup call so a flaky Telegram API doesn't crash boot.
func NewBot(token string, allowedChatID int64) (*bot.Bot, error) {
	return bot.New(token,
		bot.WithSkipGetMe(),
		bot.WithMiddlewares(chatGate(allowedChatID)),
		bot.WithDefaultHandler(defaultHandler),
	)
}

// Start runs the update loop. Blocking — call in its own goroutine.
func Start(ctx context.Context, b *bot.Bot) { b.Start(ctx) }

func chatGate(allowed int64) bot.Middleware {
	return func(next bot.HandlerFunc) bot.HandlerFunc {
		return func(ctx context.Context, b *bot.Bot, u *models.Update) {
			if u == nil || u.Message == nil {
				return
			}
			if u.Message.Chat.ID != allowed {
				log.Printf("telegram: dropping update from chat %d (expected %d)", u.Message.Chat.ID, allowed)
				return
			}
			next(ctx, b, u)
		}
	}
}

func defaultHandler(ctx context.Context, b *bot.Bot, u *models.Update) {
	if u.Message == nil {
		return
	}
	text := JoinLines(
		"<b>Commands</b>",
		"/projects — list all projects",
		"/resources [project] — list resources (optionally filtered)",
		"/usage [timeframe] — server CPU/memory/disk (e.g. 1m, 5m, 15m, 1h, 6h, 24h)",
	)
	_, _ = b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID:    u.Message.Chat.ID,
		Text:      text,
		ParseMode: models.ParseModeHTML,
	})
}
