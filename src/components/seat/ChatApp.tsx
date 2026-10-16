import { useEffect, useRef, useState } from "react";
import { Lock, Menu, Plus, Send, Settings, Square, Trash2, X } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { deleteThread, getMessages, getSeat, listThreads, redeemInvite } from "@/lib/seat/api";
import { streamChat } from "@/lib/seat/stream";
import type { MessageRow, SeatState, ThreadRow } from "@/lib/seat/types";
import { InviteDialog } from "@/components/seat/InviteDialog";
import { Markdown } from "@/components/seat/Markdown";

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
    <div className="seat-side">
      <div className="flex items-center justify-between px-3 pt-3">
        <p className="px-1 text-sm font-medium">分席</p>
        <button
          type="button"
          className="grid size-11 place-items-center md:hidden"
          aria-label="关闭目录"
          onClick={() => setNavOpen(false)}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-3 pt-2">
        <button type="button" onClick={() => selectThread(null)} className="seat-new">
          <Plus className="size-4" aria-hidden="true" />
          新的聊天
        </button>
      </div>
      <nav className="mt-2 flex-1 overflow-y-auto px-2 pb-2" aria-label="我的对话">
        {threads.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[#8e8ea0]">还没有对话</p>
        ) : null}
        <ul className="space-y-0.5">
          {threads.map((thread) => {
            const on = thread.id === activeId;
            return (
              <li key={thread.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  className={`seat-item ${on ? "on" : ""}`}
                >
                  <span className="block truncate text-sm">{thread.title}</span>
                </button>
                <button
                  type="button"
                  aria-label={`删除 ${thread.title}`}
                  onClick={() => void remove(thread.id)}
                  className="grid size-9 place-items-center text-[#8e8ea0] md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="space-y-1 border-t border-white/10 px-2 py-2">
        <p className="flex items-center gap-1 px-2 text-xs text-[#acacbe]">
          <Lock className="size-3" aria-hidden="true" />
          {seat.role === "host" ? "席主" : "客人"} · 还剩 {remaining} 条 · 共享 {pool}
        </p>
        {seat.role === "host" ? (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-[#343541]"
          >
            <Settings className="size-4" aria-hidden="true" />
            设置
          </button>
        ) : null}
        <div className="px-2 py-1">
          <UserButton />
        </div>
      </div>
    </div>
  );

  return (
    <div className="seat-app">
      <aside className="hidden w-[260px] shrink-0 md:block">{sidebar}</aside>
      {navOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="关闭" onClick={() => setNavOpen(false)} />
          <div className="relative h-full w-[260px]">{sidebar}</div>
        </div>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 items-center gap-2 px-2">
          <button
            type="button"
            className="grid size-11 place-items-center md:hidden"
            aria-label="打开目录"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm">{active?.title ?? "新的聊天"}</h1>
          <span className="pr-2 text-xs text-[#8e8ea0]">grok</span>
        </header>
        {seat.grok === "none" ? (
          <p className="px-4 pb-2 text-sm text-[#f3c98b]">
            {seat.role === "host" ? "还没有接入 Grok。打开左下角「设置」贴上 API key。" : "席主还没有接入 Grok。"}
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <p className="text-2xl font-medium">分席</p>
                <p className="mx-auto mt-3 max-w-sm text-sm text-[#acacbe]">
                  新的聊天只属于你。朋友的记录不会出现在左边。
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`seat-row ${message.role === "user" ? "user" : "bot"}`}>
                <div className="seat-row-inner">
                  <div className="seat-avatar" aria-hidden="true">
                    {message.role === "user" ? "我" : "G"}
                  </div>
                  <div className="min-w-0 flex-1 text-sm leading-6">
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : message.content ? (
                      <Markdown text={message.content} />
                    ) : (
                      <p className="text-[#acacbe]">正在想…</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className="px-3 pt-2 pb-4">
          <form
            className="seat-composer"
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
              rows={1}
              maxLength={2000}
              placeholder="输入消息，Enter 发送"
              className="max-h-40 min-h-8 w-full resize-none bg-transparent py-1 text-sm outline-none"
            />
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="seat-send" aria-label="停止">
                <Square className="size-3.5" />
              </button>
            ) : (
              <button type="submit" disabled={!draft.trim() || seat.grok === "none"} className="seat-send" aria-label="发送">
                <Send className="size-4" />
              </button>
            )}
          </form>
          {error ? (
            <p role="alert" className="mx-auto mt-2 max-w-3xl text-center text-sm text-[#fca5a5]">
              {error}
            </p>
          ) : null}
          <p className="mt-2 text-center text-xs text-[#8e8ea0]">今天还剩 {remaining} 条。内容只留在你的账号里。</p>
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
