package telegram

import (
	"context"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

// Sender pushes HTML-formatted messages to a fixed chat.
type Sender struct {
	b      *bot.Bot
	chatID int64
}

func NewSender(b *bot.Bot, chatID int64) *Sender {
	return &Sender{b: b, chatID: chatID}
}

// SendHTML posts text with ParseMode=HTML and link previews disabled. Uses a
// 10s timeout per call.
func (s *Sender) SendHTML(text string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	disabled := true
	_, err := s.b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID:             s.chatID,
		Text:               text,
		ParseMode:          models.ParseModeHTML,
		LinkPreviewOptions: &models.LinkPreviewOptions{IsDisabled: &disabled},
	})
	return err
}
