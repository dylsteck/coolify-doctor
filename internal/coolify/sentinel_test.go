package coolify

import (
	"testing"
	"time"
)

func TestParseTimeString(t *testing.T) {
	if got, ok := parseTimeString("1700000000000"); ok {
		want := time.UnixMilli(1700000000000)
		if !got.Equal(want) {
			t.Fatalf("ms string: got %v want %v", got, want)
		}
	} else {
		t.Fatal("expected 13-digit ms string to parse")
	}
	if got, ok := parseTimeString("1700000000"); !ok {
		t.Fatal("expected 10-digit unix seconds string")
	} else {
		if want := time.Unix(1700000000, 0); !got.Equal(want) {
			t.Fatalf("sec string: got %v want %v", got, want)
		}
	}
	if _, ok := parseTimeString("2024-01-15T10:00:00Z"); !ok {
		t.Fatal("expected RFC3339")
	}
}

func TestFirstFloatStrings(t *testing.T) {
	m := map[string]any{"percent": "25.5", "usedPercent": "50.00"}
	if v, ok := firstFloat(m, "percent"); !ok || v != 25.5 {
		t.Fatalf("percent string: got %v %v", v, ok)
	}
	if v, ok := firstFloat(m, "usedPercent"); !ok || v != 50 {
		t.Fatalf("usedPercent string: got %v %v", v, ok)
	}
}
