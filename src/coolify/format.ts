import type { CoolifyEvent } from "./event.js";
import { esc, joinInline, joinLines, link, prettyEvent, truncate } from "../telegram/html.js";

function orDefault(s: string, d: string): string {
  return s === "" ? d : s;
}

function appLine(e: CoolifyEvent): string {
  const parts = [`<b>${esc(orDefault(e.application_name ?? "", "app"))}</b>`];
  if (e.project) parts.push(esc(e.project));
  if (e.environment) parts.push(esc(e.environment));
  return joinInline(...parts);
}

function dbLine(e: CoolifyEvent): string {
  const parts = [`<b>${esc(orDefault(e.database_name ?? "", "database"))}</b>`];
  if (e.database_type) parts.push(esc(e.database_type));
  if (e.frequency) parts.push("every " + esc(e.frequency));
  return joinInline(...parts);
}

function serverLine(e: CoolifyEvent): string {
  if (!e.server_name) return "";
  return `Server: <b>${esc(e.server_name)}</b>`;
}

/** Renders Coolify webhook JSON into Telegram HTML. */
export function formatEvent(e: CoolifyEvent, raw: string): string {
  const icon = e.success ? "✅" : "❌";

  switch (e.event) {
    case "deployment_success":
    case "deployment_failed": {
      const title = e.event === "deployment_failed" ? "Deployment failed" : "Deployment succeeded";
      return joinLines(
        `${icon} <b>${esc(title)}</b>`,
        appLine(e),
        link("View deployment", e.deployment_url ?? ""),
      );
    }
    case "status_changed":
      return joinLines(
        `⚠️ <b>${esc(orDefault(e.message, "Status changed"))}</b>`,
        appLine(e),
        link("Open", e.url ?? ""),
      );
    case "backup_success":
    case "backup_failed": {
      const title = e.event === "backup_failed" ? "Backup failed" : "Backup succeeded";
      const lines = [`${icon} <b>${esc(title)}</b>`, dbLine(e)];
      if (e.error_output) {
        lines.push(`<pre>${esc(truncate(e.error_output, 500))}</pre>`);
      }
      lines.push(link("Open", e.url ?? ""));
      return joinLines(...lines);
    }
    case "task_success":
    case "task_failed": {
      const title = e.event === "task_failed" ? "Scheduled task failed" : "Scheduled task succeeded";
      const lines = [`${icon} <b>${esc(title)}</b>`];
      if (e.task_name) lines.push(`Task: <b>${esc(e.task_name)}</b>`);
      if (e.output) lines.push(`<pre>${esc(truncate(e.output, 500))}</pre>`);
      lines.push(link("Open", e.url ?? ""));
      return joinLines(...lines);
    }
    case "server_reachable":
    case "server_unreachable":
    case "server_disk_usage":
    case "server_patch":
      return joinLines(
        `${icon} <b>${esc(prettyEvent(e.event))}</b>`,
        serverLine(e),
        esc(e.message),
      );
    case "traefik_version_outdated":
      return joinLines("⚠️ <b>Traefik outdated</b>", esc(e.message));
    case "docker_cleanup_success":
    case "docker_cleanup_failed":
      return joinLines(
        `${icon} <b>${esc(prettyEvent(e.event))}</b>`,
        serverLine(e),
        esc(e.message),
      );
    case "test":
      return `🧪 <b>Test webhook</b>\n${esc(e.message)}`;
    default:
      return joinLines(
        `📨 <b>${esc(orDefault(e.event, "unknown_event"))}</b>`,
        esc(e.message),
        `<pre>${esc(truncate(raw, 800))}</pre>`,
      );
  }
}
