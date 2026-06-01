/**
 * Stdio MCP entry: Coolify API (read + actions) + Sentinel metrics tools.
 * Started by Cursor local agent; env vars set by coolify-doctor (never in prompts).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCoolifyActionTools } from "./coolify_action_tools.js";
import { registerCoolifyReadTools } from "./coolify_read_tools.js";
import { registerSentinelTools } from "./sentinel_tools.js";

async function main(): Promise<void> {
  const coolifyOrigin = process.env.COOLIFY_API_ORIGIN?.trim();
  const coolifyToken = process.env.COOLIFY_API_TOKEN?.trim();
  const sentinelBase = process.env.SENTINEL_BASE_URL?.trim();
  const sentinelToken = process.env.SENTINEL_TOKEN?.trim();

  const hasCoolify = Boolean(coolifyOrigin && coolifyToken);
  const hasSentinel = Boolean(sentinelBase && sentinelToken);

  if (!hasCoolify && !hasSentinel) {
    console.error("coolify_sentinel_mcp: set COOLIFY_API_ORIGIN+COOLIFY_API_TOKEN and/or SENTINEL_BASE_URL+SENTINEL_TOKEN");
    process.exit(1);
  }

  const server = new McpServer({ name: "coolify-doctor-infra", version: "1.0.0" });

  if (hasCoolify) {
    registerCoolifyReadTools(server, coolifyOrigin!, coolifyToken!);
    registerCoolifyActionTools(server, coolifyOrigin!, coolifyToken!);
  }

  if (hasSentinel) {
    registerSentinelTools(server, sentinelBase!, sentinelToken!);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

await main();
