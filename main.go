package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

func main() {
	token := mustEnv("TELEGRAM_BOT_TOKEN")
	chatIDRaw := mustEnv("TELEGRAM_CHAT_ID")
	secret := mustEnv("WEBHOOK_SECRET")
	port := envOr("PORT", "8080")

	chatID, err := strconv.ParseInt(chatIDRaw, 10, 64)
	if err != nil {
		log.Fatalf("TELEGRAM_CHAT_ID must be an integer: %v", err)
	}

	b, err := bot.New(token, bot.WithSkipGetMe())
	if err != nil {
		log.Fatalf("telegram: %v", err)
	}

	disabled := true
	send := func(text string) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := b.SendMessage(ctx, &bot.SendMessageParams{
			ChatID:             chatID,
			Text:               text,
			ParseMode:          models.ParseModeHTML,
			LinkPreviewOptions: &models.LinkPreviewOptions{IsDisabled: &disabled},
		}); err != nil {
			log.Printf("telegram send: %v", err)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("POST /webhook/{secret}", handleWebhook(secret, send))

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("coolify-doctor listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("%s is required", k)
	}
	return v
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
