import { Agent, CursorAgentError } from "@cursor/sdk";
import type { Run, SDKMessage } from "@cursor/sdk";
import type { Thread } from "chat";

export type ThreadState = {
  cursorAgentId?: string;
};

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

  let agent: Awaited<ReturnType<typeof Agent.create>>;
  try {
    agent = agentId
      ? await Agent.resume(agentId, {
          apiKey: opts.apiKey,
          model: { id: "composer-2" },
          local: { cwd: opts.cwd, settingSources: [] },
        })
      : await Agent.create({
          apiKey: opts.apiKey,
          model: { id: "composer-2" },
          local: { cwd: opts.cwd, settingSources: [] },
        });
  } catch (e) {
    if (e instanceof CursorAgentError) {
      await thread.post(`Could not start Cursor agent: ${e.message}`);
      return;
    }
    throw e;
  }

  try {
    if (!agentId) {
      await thread.setState({ cursorAgentId: agent.agentId });
    }

    const run = await agent.send(userPrompt);
    await thread.post(runTextStream(run));
    const result = await run.wait();
    if (result.status === "error") {
      await thread.post(`Run finished with error (run ${result.id}). Check logs.`);
    }
  } catch (e) {
    if (e instanceof CursorAgentError) {
      await thread.post(`Cursor error: ${e.message}`);
      return;
    }
    throw e;
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}
