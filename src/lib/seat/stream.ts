import { getBearerToken } from "@/lib/auth/client";

export type StreamEvent =
  | { type: "meta"; threadId: string; title: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

export async function streamChat(
  input: { threadId: string | null; content: string },
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch("/api/chat", {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: JSON.stringify(input),
    signal,
  });

  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "发送失败");
  }
  if (!res.body) throw new Error("发送失败");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      const event = JSON.parse(line.slice(5).trim()) as StreamEvent;
      onEvent(event);
    }
  }
}
