import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { bearerGet, coolifyV1Url } from "./coolify_api.js";

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

export function registerCoolifyReadTools(server: McpServer, origin: string, token: string): void {
  const get = (path: string) => bearerGet(coolifyV1Url(origin, path), token);

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
      const r = await get(`/applications${q}`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
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
      const r = await get(`/applications/${encodeURIComponent(uuid)}`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_get_application_logs",
    {
      description: "Get recent logs for a Coolify application by UUID.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        uuid: z.string().min(1).describe("Application UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await get(`/applications/${encodeURIComponent(uuid)}/logs`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_get_application_envs",
    {
      description: "List environment variables for a Coolify application by UUID.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        uuid: z.string().min(1).describe("Application UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await get(`/applications/${encodeURIComponent(uuid)}/envs`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
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
      const r = await get(path);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_list_databases",
    {
      description: "List Coolify databases visible to the API token.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      const r = await get("/databases");
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_get_database",
    {
      description: "Get one Coolify database by UUID.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        uuid: z.string().min(1).describe("Database UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await get(`/databases/${encodeURIComponent(uuid)}`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_list_services",
    {
      description: "List Coolify services visible to the API token.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      const r = await get("/services");
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_get_service",
    {
      description: "Get one Coolify service by UUID.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        uuid: z.string().min(1).describe("Service UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await get(`/services/${encodeURIComponent(uuid)}`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_list_projects",
    {
      description: "List Coolify projects visible to the API token.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      const r = await get("/projects");
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
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
      const r = await get("/servers");
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_get_server",
    {
      description: "Get one Coolify server by UUID.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        uuid: z.string().min(1).describe("Server UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await get(`/servers/${encodeURIComponent(uuid)}`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );

  server.registerTool(
    "coolify_get_server_resources",
    {
      description: "Get resource usage for a Coolify server by UUID.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        uuid: z.string().min(1).describe("Server UUID"),
      },
    },
    async ({ uuid }) => {
      const r = await get(`/servers/${encodeURIComponent(uuid)}/resources`);
      return { content: [{ type: "text", text: r.ok ? fmt(r.body) : err(r.status, r.body) }] };
    },
  );
}
