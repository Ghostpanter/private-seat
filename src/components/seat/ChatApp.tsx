import { useEffect, useRef, useState } from "react";
import { Lock, Menu, Plus, Send, Square, Trash2, X } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { deleteThread, getMessages, getSeat, listThreads, redeemInvite } from "@/lib/seat/api";
import { streamChat } from "@/lib/seat/stream";
import type { MessageRow, SeatState, ThreadRow } from "@/lib/seat/types";
import { InviteDialog } from "@/components/seat/InviteDialog";
import { Markdown } from "@/components/seat/Markdown";

function when(iso: string): string {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(iso));
}

export function ChatApp() {
  const [seat, setSeat] = useState<SeatState | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const localThread = useRef<string | null>(null);

  async function refreshSeat() {
    const next = await getSeat();
    setSeat(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextSeat = await getSeat();
        if (cancelled) return;
        setSeat(nextSeat);
        if (nextSeat.role === "host" || nextSeat.role === "guest") {
          const nextThreads = await listThreads();
          if (!cancelled) setThreads(nextThreads);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "席位没有打开");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    if (localThread.current === activeId) return;
    let cancelled = false;
    setMessages([]);
    void getMessages({ data: { threadId: activeId } })
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "对话没有读出来");
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  function selectThread(id: string | null) {
    abortRef.current?.abort();
    localThread.current = null;
    setBusy(false);
    setError(null);
    setActiveId(id);
    if (!id) setMessages([]);
    setNavOpen(false);
  }

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const result = await redeemInvite({ data: { code } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode("");
      const next = await refreshSeat();
      if (next.role === "host" || next.role === "guest") {
        setThreads(await listThreads());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "邀请码没有用上");
    } finally {
      setJoining(false);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy || !seat || seat.grok === "none") return;
    setError(null);
    setDraft("");
    setBusy(true);
    const localUser: MessageRow = { id: `local-${crypto.randomUUID()}`, role: "user", content };
    const localAssistant: MessageRow = { id: "pending", role: "assistant", content: "" };
    setMessages((current) => [...current, localUser, localAssistant]);
    const controller = new AbortController();
    abortRef.current = controller;
    let threadId = activeId;
    try {
      await streamChat(
        { threadId, content },
        (event) => {
          if (event.type === "meta") {
            threadId = event.threadId;
            localThread.current = event.threadId;
            setActiveId(event.threadId);
            setThreads((current) => {
              const rest = current.filter((item) => item.id !== event.threadId);
              return [{ id: event.threadId, title: event.title, updatedAt: new Date().toISOString() }, ...rest];
            });
          } else if (event.type === "delta") {
            setMessages((current) =>
              current.map((item) =>
                item.id === "pending" ? { ...item, content: item.content + event.text } : item,
              ),
            );
          } else if (event.type === "error") {
            setError(event.error);
          }
        },
        controller.signal,
      );
      if (threadId) {
        const rows = await getMessages({ data: { threadId } });
        if (rows.length) setMessages(rows);
        setThreads(await listThreads());
        setSeat(await getSeat());
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "发送失败");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function remove(id: string) {
    await deleteThread({ data: { threadId: id } });
    setThreads((current) => current.filter((item) => item.id !== id));
    if (activeId === id) selectThread(null);
  }

  if (loadError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <p className="max-w-sm text-sm text-danger">{loadError}</p>
      </main>
    );
  }

  if (!seat) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper">
        <p className="text-sm text-muted">正在确认席位…</p>
      </main>
    );
  }

  if (seat.role === "pending" || seat.role === "revoked") {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-5">
        <div className="w-full max-w-md">
          <p className="font-serif text-3xl font-medium tracking-tight">分席</p>
          <h1 className="mt-6 text-lg font-medium">
            {seat.role === "revoked" ? "这个席位已关闭" : "还没有入席"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {seat.role === "revoked"
              ? "向席主要一个新的邀请码。回来之后，以前的对话还是只有你能看见。"
              : "席主把邀请码发给你之后才能开始。你的对话不会出现在任何人的列表里。"}
          </p>
          <form
            className="mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void join();
            }}
          >
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="邀请码"
              autoCapitalize="characters"
              className="min-h-11 flex-1 rounded-sm border border-line bg-card px-3 font-mono tracking-wide"
            />
            <button
              type="submit"
              disabled={joining || code.trim().length < 6}
              className="min-h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
            >
              {joining ? "…" : "入席"}
            </button>
          </form>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-8">
            <UserButton />
          </div>
        </div>
      </main>
    );
  }

  const active = threads.find((item) => item.id === activeId);
  const remaining = Math.max(0, seat.dailyCap - seat.todayUsed);
  const pool = Math.max(0, seat.globalCap - seat.globalUsed);

  const sidebar = (
    <div className="flex h-full flex-col bg-ink text-paper">
      <div className="flex items-center justify-between px-4 pt-5">
        <div>
          <p className="font-serif text-2xl font-medium tracking-tight">分席</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-mist">
            <Lock className="size-3" aria-hidden="true" />
            互相不可见
          </p>
        </div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-sm md:hidden"
          aria-label="关闭目录"
          onClick={() => setNavOpen(false)}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={() => selectThread(null)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-paper text-sm font-medium text-ink"
        >
          <Plus className="size-4" aria-hidden="true" />
          新对话
        </button>
      </div>
      <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-3" aria-label="我的对话">
        {threads.length === 0 ? (
          <p className="px-2 py-3 text-sm text-mist">还没有对话。写一句就只留在这里。</p>
        ) : null}
        <ul>
          {threads.map((thread) => {
            const on = thread.id === activeId;
            return (
              <li key={thread.id} className="group flex items-stretch">
                <button
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  className={`min-h-11 min-w-0 flex-1 rounded-sm px-2 text-left ${on ? "bg-ink-soft" : ""}`}
                >
                  <span className="block truncate text-sm">{thread.title}</span>
                  <span className="text-xs text-mist">{when(thread.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`删除 ${thread.title}`}
                  onClick={() => void remove(thread.id)}
                  className="grid size-11 place-items-center text-mist opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-ink-soft px-4 py-4">
        <p className="text-xs text-mist">{seat.role === "host" ? "席主" : "客人"}</p>
        <p className="mt-1 text-xs text-mist tabular-nums">
          今天还剩 {remaining} 条 · 共享池 {pool}
        </p>
        <div className="mt-3 text-paper">
          <UserButton />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh bg-paper text-ink">
      <aside className="hidden w-72 shrink-0 md:block">{sidebar}</aside>
      {navOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="关闭" onClick={() => setNavOpen(false)} />
          <div className="relative h-full w-72">{sidebar}</div>
        </div>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center gap-2 border-b border-line px-3">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-sm md:hidden"
            aria-label="打开目录"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{active?.title ?? "新对话"}</h1>
          {seat.role === "host" ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="min-h-11 rounded-sm px-3 text-sm font-medium"
            >
              邀请
            </button>
          ) : (
            <span className="shrink-0 text-xs text-muted">只有你能看见</span>
          )}
        </header>
        {seat.grok === "none" ? (
          <p className="border-b border-line px-4 py-2 text-sm text-muted">
            {seat.role === "host"
              ? "还没有接入你的 Grok。打开「邀请」，贴上 xAI 的 API key。"
              : "席主还没有接入 Grok，暂时不能对话。"}
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.length === 0 ? (
              <div className="rise pt-16">
                <p className="font-serif text-3xl font-medium tracking-tight">
                  {seat.role === "host" ? "这是你的席位" : "你的席位是空的"}
                </p>
                <p className="mt-3 max-w-md text-sm text-muted">
                  {seat.role === "host"
                    ? "从这里跟 Grok 说话。用右上角的邀请把朋友请进来。他们的对话不会出现在左边，你的也不会出现在他们那里。"
                    : "跟 Grok 说的话只留在这个账号下。席主看得到你今天用了几条，看不到内容。"}
                </p>
              </div>
            ) : null}
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-xl bg-ink px-4 py-3 text-sm whitespace-pre-wrap text-paper">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="max-w-[85%] rounded-xl border border-line bg-card px-4 py-3 text-sm">
                  {message.content ? (
                    <Markdown text={message.content} />
                  ) : (
                    <p className="text-muted">正在想…</p>
                  )}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="px-4 pb-4">
          <form
            className="mx-auto max-w-2xl rounded-lg border border-line bg-card p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="composer">
              消息
            </label>
            <textarea
              id="composer"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="说点什么。这条只会留在你的席位里。"
              className="w-full resize-none bg-transparent px-2 py-2 text-sm outline-none"
            />
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <p className="text-xs text-faint tabular-nums">今天还剩 {remaining} 条</p>
              {busy ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper"
                >
                  <Square className="size-3" aria-hidden="true" />
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim() || seat.grok === "none"}
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-40"
                >
                  <Send className="size-4" aria-hidden="true" />
                  发送
                </button>
              )}
            </div>
          </form>
          {error ? (
            <p role="alert" className="mx-auto mt-2 max-w-2xl text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {seat.role === "host" ? (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          grok={seat.grok}
          onLinked={() => {
            void refreshSeat();
          }}
        />
      ) : null}
    </div>
  );
}
