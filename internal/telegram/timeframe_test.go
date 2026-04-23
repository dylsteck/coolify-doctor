package telegram

import "testing"

func TestParseTimeframe(t *testing.T) {
	for _, l := range supportedTimeframes() {
		if _, ok := parseTimeframe(l); !ok {
			t.Errorf("parseTimeframe %q", l)
		}
	}
	if _, ok := parseTimeframe("99x"); ok {
		t.Error("expected false for bad label")
	}
}

func TestCommandArg(t *testing.T) {
	if commandArg("/resources foo bar") != "foo bar" {
		t.Errorf("got %q", commandArg("/resources foo bar"))
	}
	if commandArg("/usage") != "" {
		t.Error("no arg")
	}
}
