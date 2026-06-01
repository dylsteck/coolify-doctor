import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { bearerGet, bearerPost, coolifyV1Url } from "./coolify_api.js";

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

export function registerCoolifyActionTools(server: McpServer, origin: string, token: string): void {
  server.registerTool(
    "coolify_deploy_application",
    {
      description: "Trigger a Coolify deployment for an application UUID. Requires operator confirmation before use.",
      inputSchema: {
        uuid: z.string().min(1).describe("Application UUID"),
        force: z.boolean().optional().describe("Force rebuild without cache"),
      },
    },
    async ({ uuid, force }) => {
      const body: Record<string, unknown> = { uuid };
      if (force !== undefined) body.force = force;
      const r = await bearerPost(coolifyV1Url(origin, "/deploy"), token, body);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_restart_application",
    {
      description: "Restart a Coolify application by UUID. Requires operator confirmation before use.",
      inputSchema: {
        uuid: z.string().min(1).describe("Application UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await bearerGet(coolifyV1Url(origin, `/applications/${encodeURIComponent(uuid)}/restart`), token);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_stop_application",
    {
      description: "Stop a running Coolify application by UUID. Requires operator confirmation before use.",
      inputSchema: {
        uuid: z.string().min(1).describe("Application UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await bearerGet(coolifyV1Url(origin, `/applications/${encodeURIComponent(uuid)}/stop`), token);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_start_application",
    {
      description: "Start a stopped Coolify application by UUID. Requires operator confirmation before use.",
      inputSchema: {
        uuid: z.string().min(1).describe("Application UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await bearerGet(coolifyV1Url(origin, `/applications/${encodeURIComponent(uuid)}/start`), token);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );
}
