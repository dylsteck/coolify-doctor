/**
 * Stdio MCP entry: read-only Coolify API + Sentinel metrics tools.
 * Started by Cursor local agent; env vars set by coolify-doctor (never in prompts).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { bearerGet, coolifyV1Url, sentinelApiUrl } from "./coolify_api.js";

function formatJsonBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

async function main(): Promise<void> {
  const coolifyOrigin = process.env.COOLIFY_API_ORIGIN?.trim();
  const coolifyToken = process.env.COOLIFY_API_TOKEN?.trim();
  const sentinelBase = process.env.SENTINEL_BASE_URL?.trim();
  const sentinelToken = process.env.SENTINEL_TOKEN?.trim();

  const server = new McpServer({
    name: "coolify-doctor-infra",
    version: "1.0.0",
  });

  if (coolifyOrigin && coolifyToken) {
    server.registerTool(
      "coolify_list_applications",
      {
        description: "List Coolify applications visible to the API token (optional tag filter).",
        annotations: { readOnlyHint: true },
        inputSchema: {
          tag: z.string().optional().describe("Filter by tag name"),
        },
      },
      async ({ tag }) => {
        const q = tag ? `?tag=${encodeURIComponent(tag)}` : "";
        const url = coolifyV1Url(coolifyOrigin, `/applications${q}`);
        const r = await bearerGet(url, coolifyToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "coolify_get_application",
      {
        description: "Get one Coolify application by UUID.",
        annotations: { readOnlyHint: true },
        inputSchema: {
          uuid: z.string().min(1).describe("Application UUID"),
        },
      },
      async ({ uuid }) => {
        const url = coolifyV1Url(coolifyOrigin, `/applications/${encodeURIComponent(uuid)}`);
        const r = await bearerGet(url, coolifyToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "coolify_list_deployments",
      {
        description: "List deployments for a Coolify application UUID.",
        annotations: { readOnlyHint: true },
        inputSchema: {
          application_uuid: z.string().min(1),
          skip: z.number().int().min(0).optional(),
          take: z.number().int().min(1).max(100).optional(),
        },
      },
      async ({ application_uuid, skip, take }) => {
        const params = new URLSearchParams();
        if (skip !== undefined) params.set("skip", String(skip));
        if (take !== undefined) params.set("take", String(take));
        const qs = params.toString();
        const path = `/deployments/applications/${encodeURIComponent(application_uuid)}${qs ? `?${qs}` : ""}`;
        const url = coolifyV1Url(coolifyOrigin, path);
        const r = await bearerGet(url, coolifyToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "coolify_list_servers",
      {
        description: "List Coolify servers for the API token team.",
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      async () => {
        const url = coolifyV1Url(coolifyOrigin, "/servers");
        const r = await bearerGet(url, coolifyToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );
  }

  if (sentinelBase && sentinelToken) {
    server.registerTool(
      "sentinel_health",
      {
        description: "Sentinel GET /api/health.",
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      async () => {
        const url = sentinelApiUrl(sentinelBase, "/api/health");
        const r = await bearerGet(url, sentinelToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "sentinel_memory_current",
      {
        description: "Sentinel current host memory usage.",
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      async () => {
        const url = sentinelApiUrl(sentinelBase, "/api/memory/current");
        const r = await bearerGet(url, sentinelToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "sentinel_memory_history",
      {
        description: "Sentinel host memory history (optional ISO8601 from/to).",
        annotations: { readOnlyHint: true },
        inputSchema: {
          from: z.string().optional().describe("ISO8601 start (UTC)"),
          to: z.string().optional().describe("ISO8601 end (UTC)"),
        },
      },
      async ({ from, to }) => {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const qs = params.toString();
        const url = sentinelApiUrl(sentinelBase, `/api/memory/history${qs ? `?${qs}` : ""}`);
        const r = await bearerGet(url, sentinelToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "sentinel_cpu_current",
      {
        description: "Sentinel current host CPU usage.",
        annotations: { readOnlyHint: true },
        inputSchema: {},
      },
      async () => {
        const url = sentinelApiUrl(sentinelBase, "/api/cpu/current");
        const r = await bearerGet(url, sentinelToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "sentinel_container_memory_history",
      {
        description: "Sentinel memory history for a Docker container id.",
        annotations: { readOnlyHint: true },
        inputSchema: {
          container_id: z.string().min(1),
          from: z.string().optional(),
          to: z.string().optional(),
        },
      },
      async ({ container_id, from, to }) => {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const qs = params.toString();
        const path = `/api/container/${encodeURIComponent(container_id)}/memory/history${qs ? `?${qs}` : ""}`;
        const url = sentinelApiUrl(sentinelBase, path);
        const r = await bearerGet(url, sentinelToken);
        const text = r.ok ? formatJsonBody(r.body) : `HTTP ${r.status}: ${r.body.slice(0, 4000)}`;
        return { content: [{ type: "text", text }] };
      },
    );
  }

  const hasCoolify = Boolean(coolifyOrigin && coolifyToken);
  const hasSentinel = Boolean(sentinelBase && sentinelToken);
  if (!hasCoolify && !hasSentinel) {
    console.error("coolify_sentinel_mcp: set COOLIFY_API_ORIGIN+COOLIFY_API_TOKEN and/or SENTINEL_BASE_URL+SENTINEL_TOKEN");
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

await main();
