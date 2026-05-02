import { fileURLToPath } from "node:url";
import type { AgentOptions } from "@cursor/sdk";
import type { Config } from "../config.js";

/** Path to compiled MCP entry (same dir layout under dist/). */
export function mcpServerScriptPath(): string {
  return fileURLToPath(new URL("./coolify_sentinel_mcp.js", import.meta.url));
}

export function isCoolifyApiConfigured(cfg: Config): boolean {
  return Boolean(cfg.COOLIFY_API_ORIGIN?.trim() && cfg.COOLIFY_API_TOKEN?.trim());
}

export function isSentinelConfigured(cfg: Config): boolean {
  return Boolean(cfg.SENTINEL_BASE_URL?.trim() && cfg.SENTINEL_TOKEN?.trim());
}

/**
 * Stdio MCP exposing read-only Coolify + Sentinel tools when env is set.
 * Token values are passed only in the child process env, never in prompts.
 */
export function buildMcpServersForAgent(cfg: Config): AgentOptions["mcpServers"] | undefined {
  if (!isCoolifyApiConfigured(cfg) && !isSentinelConfigured(cfg)) {
    return undefined;
  }
  const env: Record<string, string> = {};
  if (isCoolifyApiConfigured(cfg)) {
    env.COOLIFY_API_ORIGIN = cfg.COOLIFY_API_ORIGIN!.trim();
    env.COOLIFY_API_TOKEN = cfg.COOLIFY_API_TOKEN!.trim();
  }
  if (isSentinelConfigured(cfg)) {
    env.SENTINEL_BASE_URL = cfg.SENTINEL_BASE_URL!.trim();
    env.SENTINEL_TOKEN = cfg.SENTINEL_TOKEN!.trim();
  }
  return {
    coolify_doctor_infra: {
      type: "stdio",
      command: process.execPath,
      args: [mcpServerScriptPath()],
      env,
    },
  };
}
