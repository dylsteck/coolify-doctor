import { Agent, CursorAgentError } from "@cursor/sdk";
import type { Run, SDKMessage } from "@cursor/sdk";
import type { Thread } from "chat";

export const CURSOR_MODEL_ID = "composer-1.5" as const;

export type ThreadState = {
  cursorAgentId?: string;
};

const RUNTIME_GROUNDING = [
  "You are reached via the coolify-doctor Telegram bot using the Cursor SDK local runtime.",
  "Your workspace is local.cwd (AGENT_WORKSPACE): file and shell tools only see that directory tree on the machine running this Node process. Broader host access requires those paths to be bind-mounted under AGENT_WORKSPACE (prefer read-only).",
  "For Sentinel or Coolify metrics: use files or HTTP endpoints reachable from this process; if nothing is exposed, say briefly to use Coolify Server → Metrics or Sentinel’s API with a Bearer token on a reachable URL. Never invent numbers.",
  "Use your tools within the workspace as usual.",
].join(" ");

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
  },
): Promise<void> {
  const state = await thread.state;
  let agentId = state?.cursorAgentId;
  console.info("[cursor] run cwd=%s resume=%s prompt_len=%s", opts.cwd, Boolean(agentId), userPrompt.length);

  let agent: Awaited<ReturnType<typeof Agent.create>>;
  try {
    agent = agentId
      ? await Agent.resume(agentId, {
          apiKey: opts.apiKey,
          model: { id: CURSOR_MODEL_ID },
          local: { cwd: opts.cwd, settingSources: [] },
        })
      : await Agent.create({
          apiKey: opts.apiKey,
          model: { id: CURSOR_MODEL_ID },
          local: { cwd: opts.cwd, settingSources: [] },
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

    const prompt = agentId ? userPrompt : `${RUNTIME_GROUNDING}\n\n---\n\n${userPrompt}`;
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
