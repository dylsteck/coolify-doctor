import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { bearerGet, sentinelApiUrl } from "./coolify_api.js";

function fmt(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function err(status: number, body: string): string {
  return `HTTP ${status}: ${body.slice(0, 4000)}`;
}

export function registerSentinelTools(server: McpServer, base: string, token: string): void {
  const get = (path: string) => bearerGet(sentinelApiUrl(base, path), token);

  server.registerTool(
    "sentinel_health",
    {
      description: "Sentinel GET /api/health.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      const r = await get("/api/health");
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
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
      const r = await get("/api/memory/current");
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
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
      const r = await get(`/api/memory/history${qs ? `?${qs}` : ""}`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
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
      const r = await get("/api/cpu/current");
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
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
      const r = await get(path);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );
}
