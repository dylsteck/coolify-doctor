package config

import (
	"os"
	"testing"
	"time"
)

func TestLoad_Required(t *testing.T) {
	clearTestEnv()
	t.Cleanup(clearTestEnv)
	os.Setenv("TELEGRAM_BOT_TOKEN", "t")
	os.Setenv("TELEGRAM_CHAT_ID", "1")
	os.Setenv("WEBHOOK_SECRET", "s")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TelegramBotToken != "t" || cfg.TelegramChatID != 1 || cfg.WebhookSecret != "s" {
		t.Fatalf("unexpected cfg: %#v", cfg)
	}
}

func TestLoad_MissingRequired(t *testing.T) {
	clearTestEnv()
	t.Cleanup(clearTestEnv)
	_, err := Load()
	if err == nil {
		t.Fatal("expected error for missing env")
	}
}

func TestLoad_ChatIDInvalid(t *testing.T) {
	clearTestEnv()
	t.Cleanup(clearTestEnv)
	os.Setenv("TELEGRAM_BOT_TOKEN", "t")
	os.Setenv("TELEGRAM_CHAT_ID", "nope")
	os.Setenv("WEBHOOK_SECRET", "s")
	_, err := Load()
	if err == nil {
		t.Fatal("expected error for bad TELEGRAM_CHAT_ID")
	}
}

func TestLoad_Defaults(t *testing.T) {
	clearTestEnv()
	t.Cleanup(clearTestEnv)
	os.Setenv("TELEGRAM_BOT_TOKEN", "t")
	os.Setenv("TELEGRAM_CHAT_ID", "42")
	os.Setenv("WEBHOOK_SECRET", "s")
	os.Setenv("COOLIFY_URL", "http://x/")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" {
		t.Errorf("port: got %q", cfg.Port)
	}
	if cfg.SentinelURL != "http://coolify-sentinel:8888" {
		t.Errorf("default sentinel: got %q", cfg.SentinelURL)
	}
	if cfg.SentinelHTTPTimeout != 45*time.Second {
		t.Errorf("default sentinel http timeout: got %v", cfg.SentinelHTTPTimeout)
	}
	if cfg.CoolifyURL != "http://x" {
		t.Errorf("coolify url should trim trailing slash: got %q", cfg.CoolifyURL)
	}
}

func TestLoad_SentinelHTTPTimeout(t *testing.T) {
	clearTestEnv()
	t.Cleanup(clearTestEnv)
	os.Setenv("TELEGRAM_BOT_TOKEN", "t")
	os.Setenv("TELEGRAM_CHAT_ID", "1")
	os.Setenv("WEBHOOK_SECRET", "s")
	os.Setenv("SENTINEL_HTTP_TIMEOUT_SECONDS", "120")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.SentinelHTTPTimeout != 120*time.Second {
		t.Errorf("got %v", cfg.SentinelHTTPTimeout)
	}
}

func TestConfig_Flags(t *testing.T) {
	var c Config
	if c.CoolifyConfigured() {
		t.Error("empty should be false")
	}
	c.CoolifyURL, c.CoolifyToken = "u", "t"
	if !c.CoolifyConfigured() {
		t.Error("url+token should be true")
	}
	if c.SentinelConfigured() {
		t.Error("no sentinel token")
	}
	c.SentinelToken = "x"
	if !c.SentinelConfigured() {
		t.Error("with token true")
	}
}

func clearTestEnv() {
	for _, k := range []string{
		"TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "WEBHOOK_SECRET",
		"COOLIFY_URL", "COOLIFY_API_TOKEN", "SENTINEL_URL", "SENTINEL_TOKEN", "PORT",
	} {
		_ = os.Unsetenv(k)
	}
}
