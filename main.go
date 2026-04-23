package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/dylsteck/coolify-doctor/internal/config"
	"github.com/dylsteck/coolify-doctor/internal/coolify"
	"github.com/dylsteck/coolify-doctor/internal/telegram"
	"github.com/dylsteck/coolify-doctor/internal/webhook"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	b, err := telegram.NewBot(cfg.TelegramBotToken, cfg.TelegramChatID)
	if err != nil {
		log.Fatalf("telegram: %v", err)
	}
	sender := telegram.NewSender(b, cfg.TelegramChatID)

	handlers := &telegram.Handlers{}
	if cfg.CoolifyConfigured() {
		handlers.Coolify = coolify.NewClient(cfg.CoolifyURL, cfg.CoolifyToken)
	}
	if cfg.SentinelConfigured() {
		handlers.Sentinel = coolify.NewSentinelClient(cfg.SentinelURL, cfg.SentinelToken)
	}
	handlers.Register(b)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("POST /webhook/{secret}", webhook.NewHandler(cfg.WebhookSecret, sender))

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	go telegram.Start(ctx, b)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("coolify-doctor listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
