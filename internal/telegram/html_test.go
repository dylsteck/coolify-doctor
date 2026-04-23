package telegram

import (
	"strings"
	"testing"
)

func TestEsc(t *testing.T) {
	if got := Esc(`<a>&"'"`); !strings.Contains(got, `&amp;`) {
		t.Errorf("escaping: %q", got)
	}
}

func TestLink(t *testing.T) {
	if Link("x", "") != "" {
		t.Error("empty url")
	}
	if got := Link(`l`, `https://a.com?x=1`); !strings.Contains(got, `href=`) {
		t.Errorf("link: %q", got)
	}
}

func TestJoinLines_Inline(t *testing.T) {
	if JoinLines("a", "", "b") != "a\nb" {
		t.Errorf("lines: %q", JoinLines("a", "", "b"))
	}
	if JoinInline("a", "", "b") != "a · b" {
		t.Errorf("inline: %q", JoinInline("a", "", "b"))
	}
}

func TestTruncate(t *testing.T) {
	if Truncate("ab", 10) != "ab" {
		t.Error("no truncate")
	}
	if Truncate("abcdefghij", 3) != "abc…" {
		t.Error("truncate")
	}
}

func TestPrettyEvent(t *testing.T) {
	if got := PrettyEvent("deployment_success"); !strings.Contains(got, "Deployment") {
		t.Errorf("%q", got)
	}
}
