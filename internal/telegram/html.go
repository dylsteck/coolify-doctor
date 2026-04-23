package telegram

import (
	"fmt"
	"html"
	"strings"
)

// Esc HTML-escapes a plain string for inclusion in ParseMode=HTML text.
func Esc(s string) string { return html.EscapeString(s) }

// Link renders an <a href=""> with escaped URL and label.
func Link(label, url string) string {
	if url == "" {
		return ""
	}
	return fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(url), Esc(label))
}

// JoinLines concatenates non-empty parts with "\n".
func JoinLines(parts ...string) string {
	return joinNonEmpty(parts, "\n")
}

// JoinInline concatenates non-empty parts with " · " for single-line rendering.
func JoinInline(parts ...string) string {
	return joinNonEmpty(parts, " · ")
}

// Truncate cuts s to n bytes (with ellipsis). Safe for ASCII; if you call it
// on multi-byte text destined for non-<pre> contexts, prefer a rune-aware cut.
func Truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// PrettyEvent turns snake_case into Title Case words.
func PrettyEvent(e string) string {
	parts := strings.Split(e, "_")
	for i, p := range parts {
		if p == "" {
			continue
		}
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	return strings.Join(parts, " ")
}

func joinNonEmpty(parts []string, sep string) string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, sep)
}
