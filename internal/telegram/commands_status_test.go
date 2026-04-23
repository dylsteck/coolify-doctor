package telegram

import "testing"

func TestDisplayResourceStatus(t *testing.T) {
	tests := []struct{ in, want string }{
		{"running:unknown", "running"},
		{"running:healthy", "running:healthy"},
		{"exited:1", "exited:1"},
		{"  healthy  ", "healthy"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := displayResourceStatus(tt.in); got != tt.want {
			t.Errorf("displayResourceStatus(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
