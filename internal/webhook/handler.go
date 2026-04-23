package webhook

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/dylsteck/coolify-doctor/internal/coolify"
	"github.com/dylsteck/coolify-doctor/internal/telegram"
)

// NewHandler returns an http.Handler for POST /webhook/{secret}. The handler
// verifies the path secret in constant time, decodes the Coolify payload,
// formats it, and forwards to Telegram via the supplied Sender.
//
// Returns 200 on everything except secret mismatch (401) and body-too-large
// (handled by MaxBytesReader) — Coolify retries aggressively and we don't want
// retry storms on our own bugs.
func NewHandler(secret string, sender *telegram.Sender) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := r.PathValue("secret")
		if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
		if err != nil {
			log.Printf("webhook: read body: %v", err)
			w.WriteHeader(http.StatusOK)
			return
		}

		var ev coolify.Event
		if err := json.Unmarshal(body, &ev); err != nil {
			log.Printf("webhook: decode failed (%v), raw=%s", err, string(body))
			w.WriteHeader(http.StatusOK)
			return
		}

		text := Format(ev, body)
		log.Printf("webhook: event=%s success=%v", ev.Event, ev.Success)
		if err := sender.SendHTML(text); err != nil {
			log.Printf("telegram send: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	})
}
