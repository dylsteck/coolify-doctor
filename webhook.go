package main

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
)

// Event is a superset of every Coolify webhook payload shape.
// Coolify's notification classes all produce JSON with `success`, `message`,
// `event`, plus event-specific fields; we decode into one struct rather than
// branching on typed structs per event.
type Event struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Event   string `json:"event"`

	// Deployment / status_changed
	ApplicationName string `json:"application_name,omitempty"`
	ApplicationUUID string `json:"application_uuid,omitempty"`
	DeploymentUUID  string `json:"deployment_uuid,omitempty"`
	DeploymentURL   string `json:"deployment_url,omitempty"`
	Project         string `json:"project,omitempty"`
	Environment     string `json:"environment,omitempty"`
	PullRequestID   any    `json:"pull_request_id,omitempty"`
	PreviewFQDN     string `json:"preview_fqdn,omitempty"`
	FQDN            string `json:"fqdn,omitempty"`
	URL             string `json:"url,omitempty"`

	// Backup
	DatabaseName string `json:"database_name,omitempty"`
	DatabaseUUID string `json:"database_uuid,omitempty"`
	DatabaseType string `json:"database_type,omitempty"`
	Frequency    string `json:"frequency,omitempty"`
	ErrorOutput  string `json:"error_output,omitempty"`

	// Scheduled task
	TaskName     string `json:"task_name,omitempty"`
	TaskUUID     string `json:"task_uuid,omitempty"`
	Output       string `json:"output,omitempty"`
	ServiceUUID  string `json:"service_uuid,omitempty"`

	// Server
	ServerName string          `json:"server_name,omitempty"`
	ServerUUID string          `json:"server_uuid,omitempty"`
	DiskUsage  any             `json:"disk_usage,omitempty"`
	Servers    json.RawMessage `json:"servers,omitempty"`
}

func handleWebhook(secret string, send func(text string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		var ev Event
		if err := json.Unmarshal(body, &ev); err != nil {
			log.Printf("webhook: decode failed (%v), raw=%s", err, string(body))
			w.WriteHeader(http.StatusOK)
			return
		}

		text := formatEvent(ev, body)
		log.Printf("webhook: event=%s success=%v", ev.Event, ev.Success)
		send(text)
		w.WriteHeader(http.StatusOK)
	}
}

func formatEvent(e Event, raw []byte) string {
	icon := "✅"
	if !e.Success {
		icon = "❌"
	}

	switch e.Event {
	case "deployment_success", "deployment_failed":
		title := "Deployment succeeded"
		if e.Event == "deployment_failed" {
			title = "Deployment failed"
		}
		return joinLines(
			fmt.Sprintf("%s <b>%s</b>", icon, esc(title)),
			appLine(e),
			link("View deployment", e.DeploymentURL),
		)

	case "status_changed":
		return joinLines(
			fmt.Sprintf("⚠️ <b>%s</b>", esc(orDefault(e.Message, "Status changed"))),
			appLine(e),
			link("Open", e.URL),
		)

	case "backup_success", "backup_failed":
		title := "Backup succeeded"
		if e.Event == "backup_failed" {
			title = "Backup failed"
		}
		lines := []string{
			fmt.Sprintf("%s <b>%s</b>", icon, esc(title)),
			dbLine(e),
		}
		if e.ErrorOutput != "" {
			lines = append(lines, fmt.Sprintf("<pre>%s</pre>", esc(truncate(e.ErrorOutput, 500))))
		}
		lines = append(lines, link("Open", e.URL))
		return joinLines(lines...)

	case "task_success", "task_failed":
		title := "Scheduled task succeeded"
		if e.Event == "task_failed" {
			title = "Scheduled task failed"
		}
		lines := []string{
			fmt.Sprintf("%s <b>%s</b>", icon, esc(title)),
		}
		if e.TaskName != "" {
			lines = append(lines, fmt.Sprintf("Task: <b>%s</b>", esc(e.TaskName)))
		}
		if e.Output != "" {
			lines = append(lines, fmt.Sprintf("<pre>%s</pre>", esc(truncate(e.Output, 500))))
		}
		lines = append(lines, link("Open", e.URL))
		return joinLines(lines...)

	case "server_reachable", "server_unreachable", "server_disk_usage", "server_patch":
		return joinLines(
			fmt.Sprintf("%s <b>%s</b>", icon, esc(prettyEvent(e.Event))),
			serverLine(e),
			esc(e.Message),
		)

	case "traefik_version_outdated":
		return joinLines(
			"⚠️ <b>Traefik outdated</b>",
			esc(e.Message),
		)

	case "docker_cleanup_success", "docker_cleanup_failed":
		return joinLines(
			fmt.Sprintf("%s <b>%s</b>", icon, esc(prettyEvent(e.Event))),
			serverLine(e),
			esc(e.Message),
		)

	case "test":
		return fmt.Sprintf("🧪 <b>Test webhook</b>\n%s", esc(e.Message))
	}

	// Unknown event — surface what we got so nothing is silently dropped.
	return fmt.Sprintf(
		"📨 <b>%s</b>\n%s\n<pre>%s</pre>",
		esc(orDefault(e.Event, "unknown_event")),
		esc(e.Message),
		esc(truncate(string(raw), 800)),
	)
}

func appLine(e Event) string {
	name := orDefault(e.ApplicationName, "app")
	parts := []string{fmt.Sprintf("<b>%s</b>", esc(name))}
	if e.Project != "" {
		parts = append(parts, esc(e.Project))
	}
	if e.Environment != "" {
		parts = append(parts, esc(e.Environment))
	}
	return joinInline(parts)
}

func dbLine(e Event) string {
	name := orDefault(e.DatabaseName, "database")
	parts := []string{fmt.Sprintf("<b>%s</b>", esc(name))}
	if e.DatabaseType != "" {
		parts = append(parts, esc(e.DatabaseType))
	}
	if e.Frequency != "" {
		parts = append(parts, "every "+esc(e.Frequency))
	}
	return joinInline(parts)
}

func serverLine(e Event) string {
	if e.ServerName == "" {
		return ""
	}
	return fmt.Sprintf("Server: <b>%s</b>", esc(e.ServerName))
}

func link(label, url string) string {
	if url == "" {
		return ""
	}
	return fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(url), esc(label))
}

func joinLines(lines ...string) string {
	out := ""
	for _, l := range lines {
		if l == "" {
			continue
		}
		if out != "" {
			out += "\n"
		}
		out += l
	}
	return out
}

func joinInline(parts []string) string {
	out := ""
	for _, p := range parts {
		if p == "" {
			continue
		}
		if out != "" {
			out += " · "
		}
		out += p
	}
	return out
}

func esc(s string) string {
	return html.EscapeString(s)
}

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func prettyEvent(e string) string {
	out := []byte(e)
	for i, b := range out {
		if b == '_' {
			out[i] = ' '
		}
	}
	if len(out) > 0 && out[0] >= 'a' && out[0] <= 'z' {
		out[0] -= 32
	}
	return string(out)
}
