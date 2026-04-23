package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	TelegramBotToken string
	TelegramChatID   int64
	WebhookSecret    string

	CoolifyURL    string
	CoolifyToken  string
	SentinelURL   string
	SentinelToken string

	Port string
}

func Load() (*Config, error) {
	var missing []string
	req := func(k string) string {
		v := strings.TrimSpace(os.Getenv(k))
		if v == "" {
			missing = append(missing, k)
		}
		return v
	}

	cfg := &Config{
		TelegramBotToken: req("TELEGRAM_BOT_TOKEN"),
		WebhookSecret:    req("WEBHOOK_SECRET"),
		CoolifyURL:       strings.TrimRight(strings.TrimSpace(os.Getenv("COOLIFY_URL")), "/"),
		CoolifyToken:     strings.TrimSpace(os.Getenv("COOLIFY_API_TOKEN")),
		SentinelURL:      orDefault(strings.TrimRight(strings.TrimSpace(os.Getenv("SENTINEL_URL")), "/"), "http://coolify-sentinel:8888"),
		SentinelToken:    strings.TrimSpace(os.Getenv("SENTINEL_TOKEN")),
		Port:             orDefault(strings.TrimSpace(os.Getenv("PORT")), "8080"),
	}

	chatRaw := req("TELEGRAM_CHAT_ID")
	if chatRaw != "" {
		id, err := strconv.ParseInt(chatRaw, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("TELEGRAM_CHAT_ID must be an integer: %w", err)
		}
		cfg.TelegramChatID = id
	}

	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required env: %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}

func (c *Config) CoolifyConfigured() bool  { return c.CoolifyURL != "" && c.CoolifyToken != "" }
func (c *Config) SentinelConfigured() bool { return c.SentinelToken != "" }

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}
