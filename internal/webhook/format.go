package webhook

import (
	"fmt"

	"github.com/dylsteck/coolify-doctor/internal/coolify"
	"github.com/dylsteck/coolify-doctor/internal/telegram"
)

// Format renders a Coolify webhook payload into a Telegram HTML message. Raw
// body is passed through for the unknown-event fallback so nothing is silently
// dropped.
func Format(e coolify.Event, raw []byte) string {
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
		return telegram.JoinLines(
			fmt.Sprintf("%s <b>%s</b>", icon, telegram.Esc(title)),
			appLine(e),
			telegram.Link("View deployment", e.DeploymentURL),
		)

	case "status_changed":
		return telegram.JoinLines(
			fmt.Sprintf("⚠️ <b>%s</b>", telegram.Esc(orDefault(e.Message, "Status changed"))),
			appLine(e),
			telegram.Link("Open", e.URL),
		)

	case "backup_success", "backup_failed":
		title := "Backup succeeded"
		if e.Event == "backup_failed" {
			title = "Backup failed"
		}
		lines := []string{
			fmt.Sprintf("%s <b>%s</b>", icon, telegram.Esc(title)),
			dbLine(e),
		}
		if e.ErrorOutput != "" {
			lines = append(lines, fmt.Sprintf("<pre>%s</pre>", telegram.Esc(telegram.Truncate(e.ErrorOutput, 500))))
		}
		lines = append(lines, telegram.Link("Open", e.URL))
		return telegram.JoinLines(lines...)

	case "task_success", "task_failed":
		title := "Scheduled task succeeded"
		if e.Event == "task_failed" {
			title = "Scheduled task failed"
		}
		lines := []string{fmt.Sprintf("%s <b>%s</b>", icon, telegram.Esc(title))}
		if e.TaskName != "" {
			lines = append(lines, fmt.Sprintf("Task: <b>%s</b>", telegram.Esc(e.TaskName)))
		}
		if e.Output != "" {
			lines = append(lines, fmt.Sprintf("<pre>%s</pre>", telegram.Esc(telegram.Truncate(e.Output, 500))))
		}
		lines = append(lines, telegram.Link("Open", e.URL))
		return telegram.JoinLines(lines...)

	case "server_reachable", "server_unreachable", "server_disk_usage", "server_patch":
		return telegram.JoinLines(
			fmt.Sprintf("%s <b>%s</b>", icon, telegram.Esc(telegram.PrettyEvent(e.Event))),
			serverLine(e),
			telegram.Esc(e.Message),
		)

	case "traefik_version_outdated":
		return telegram.JoinLines(
			"⚠️ <b>Traefik outdated</b>",
			telegram.Esc(e.Message),
		)

	case "docker_cleanup_success", "docker_cleanup_failed":
		return telegram.JoinLines(
			fmt.Sprintf("%s <b>%s</b>", icon, telegram.Esc(telegram.PrettyEvent(e.Event))),
			serverLine(e),
			telegram.Esc(e.Message),
		)

	case "test":
		return fmt.Sprintf("🧪 <b>Test webhook</b>\n%s", telegram.Esc(e.Message))
	}

	return fmt.Sprintf(
		"📨 <b>%s</b>\n%s\n<pre>%s</pre>",
		telegram.Esc(orDefault(e.Event, "unknown_event")),
		telegram.Esc(e.Message),
		telegram.Esc(telegram.Truncate(string(raw), 800)),
	)
}

func appLine(e coolify.Event) string {
	parts := []string{fmt.Sprintf("<b>%s</b>", telegram.Esc(orDefault(e.ApplicationName, "app")))}
	if e.Project != "" {
		parts = append(parts, telegram.Esc(e.Project))
	}
	if e.Environment != "" {
		parts = append(parts, telegram.Esc(e.Environment))
	}
	return telegram.JoinInline(parts...)
}

func dbLine(e coolify.Event) string {
	parts := []string{fmt.Sprintf("<b>%s</b>", telegram.Esc(orDefault(e.DatabaseName, "database")))}
	if e.DatabaseType != "" {
		parts = append(parts, telegram.Esc(e.DatabaseType))
	}
	if e.Frequency != "" {
		parts = append(parts, "every "+telegram.Esc(e.Frequency))
	}
	return telegram.JoinInline(parts...)
}

func serverLine(e coolify.Event) string {
	if e.ServerName == "" {
		return ""
	}
	return fmt.Sprintf("Server: <b>%s</b>", telegram.Esc(e.ServerName))
}

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}
