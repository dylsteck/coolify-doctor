import { Agent, CursorAgentError } from "@cursor/sdk";
import type { AgentOptions, Run, SDKMessage } from "@cursor/sdk";
import type { Thread } from "chat";
import { CURSOR_MODEL_ID } from "../cursor/models.js";

export { CURSOR_MODEL_ID };

export type ThreadState = {
  cursorAgentId?: string;
};

function buildGrounding(hasInfraMcp: boolean): string {
  const lines = [
    "You are **coolify-doctor**: a read-mostly assistant for Coolify, Docker, and host visibility over Telegram. Your job is to help the operator understand and debug their stack (configs, logs, metrics paths, repo layout)—not to take destructive action by default.",
    "Safety: prefer inspection (read, list, grep, curl read-only checks). Do not delete data, recycle containers, edit production configs, rotate secrets, or run destructive commands unless the user clearly asks and you have warned about risk. When unsure, suggest what to run instead of doing it.",
    "Runtime: Cursor local agent; workspace is AGENT_WORKSPACE (local.cwd). Tools only see that directory tree unless the operator bind-mounted more there.",
  ];
  if (hasInfraMcp) {
    lines.push(
      "Infra MCP tools (**coolify_***, **sentinel_***) are available: use them for Coolify API and Sentinel metrics truth. Prefer tools over guessing; never invent deployment status or metric numbers.",
    );
  } else {
    lines.push(
      "No Coolify/Sentinel MCP configured: use files and shell only. For dashboard parity, configure COOLIFY_API_ORIGIN+COOLIFY_API_TOKEN and/or SENTINEL_BASE_URL+SENTINEL_TOKEN on the server. Never invent numbers.",
    );
  }
  return lines.join(" ");
}

function extractAssistantText(ev: SDKMessage): string {
  if (ev.type !== "assistant") return "";
  return ev.message.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function* runTextStream(run: Run): AsyncGenerator<string> {
  for await (const ev of run.stream()) {
    const t = extractAssistantText(ev);
    if (t) yield t;
  }
}

export async function runCursorOnThread(
  thread: Thread<ThreadState>,
  userPrompt: string,
  opts: {
    apiKey: string;
    cwd: string;
    mcpServers?: AgentOptions["mcpServers"];
  },
): Promise<void> {
  const state = await thread.state;
  let agentId = state?.cursorAgentId;
  const hasMcp = Boolean(opts.mcpServers && Object.keys(opts.mcpServers).length > 0);
  console.info(
    "[cursor] run cwd=%s resume=%s mcp=%s prompt_len=%s",
    opts.cwd,
    Boolean(agentId),
    hasMcp,
    userPrompt.length,
  );

  const agentOptsBase = {
    apiKey: opts.apiKey,
    model: { id: CURSOR_MODEL_ID },
    local: { cwd: opts.cwd, settingSources: [] },
    ...(opts.mcpServers ? { mcpServers: opts.mcpServers } : {}),
  };

  let agent: Awaited<ReturnType<typeof Agent.create>>;
  try {
    agent = agentId
      ? await Agent.resume(agentId, {
          ...agentOptsBase,
        })
      : await Agent.create({
          ...agentOptsBase,
        });
  } catch (e) {
    if (e instanceof CursorAgentError) {
      console.error("[cursor] agent start failed:", e.message);
      await thread.post(`Could not start Cursor agent: ${e.message}`);
      return;
    }
    console.error("[cursor] agent start unexpected:", e);
    throw e;
  }

  try {
    if (!agentId) {
      await thread.setState({ cursorAgentId: agent.agentId });
    }

    const grounding = buildGrounding(hasMcp);
    const prompt = agentId ? userPrompt : `${grounding}\n\n---\n\n${userPrompt}`;
    const run = await agent.send(prompt);
    await thread.post(runTextStream(run));
    const result = await run.wait();
    console.info("[cursor] run done id=%s status=%s", result.id, result.status);
    if (result.status === "error") {
      await thread.post(`Run finished with error (run ${result.id}). Check logs.`);
    }
  } catch (e) {
    if (e instanceof CursorAgentError) {
      console.error("[cursor] run error:", e.message);
      await thread.post(`Cursor error: ${e.message}`);
      return;
    }
    console.error("[cursor] run unexpected:", e);
    throw e;
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}
