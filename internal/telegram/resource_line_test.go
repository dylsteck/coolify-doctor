package telegram

import (
	"strings"
	"testing"

	"github.com/dylsteck/coolify-doctor/internal/coolify"
)

func TestFormatResource_RunningUnknown(t *testing.T) {
	line := formatResource(coolify.Resource{Name: "n", Type: "application", Status: "running:unknown"})
	if strings.Contains(line, "unknown") {
		t.Fatalf("should strip :unknown: %s", line)
	}
}

func TestStatusIcon(t *testing.T) {
	tests := []struct{ in, want string }{
		{"running", "🟢"},
		{"healthy", "🟢"},
		{"failed", "🔴"},
		{"starting", "🟡"},
		{"weird", "⚪️"},
	}
	for _, tt := range tests {
		if got := statusIcon(tt.in); got != tt.want {
			t.Errorf("statusIcon(%q) = %q want %q", tt.in, got, tt.want)
		}
	}
}
