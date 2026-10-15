import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, X } from "lucide-react";
import { clearGrokKey, createInvite, listGuests, listInvites, revokeInvite, saveGrokKey, setGuestOpen } from "@/lib/seat/api";
import type { GrokLink, GuestRow, InviteRow } from "@/lib/seat/types";

export function InviteDialog({
  open,
  onOpenChange,
  grok,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grok: GrokLink;
  onLinked: () => void;
}) {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [linking, setLinking] = useState(false);

  async function reload() {
    const [nextInvites, nextGuests] = await Promise.all([listInvites(), listGuests()]);
    setInvites(nextInvites);
    setGuests(nextGuests);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    void Promise.all([listInvites(), listGuests()])
      .then(([nextInvites, nextGuests]) => {
        if (cancelled) return;
        setInvites(nextInvites);
        setGuests(nextGuests);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "没有加载出来");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      await createInvite({ data: { maxUses, label } });
      setLabel("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "没有生成");
    } finally {
      setBusy(false);
    }
  }

  async function linkKey() {
    setLinking(true);
    setError(null);
    try {
      await saveGrokKey({ data: { key: apiKey } });
      setApiKey("");
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "没有接上");
    } finally {
      setLinking(false);
    }
  }

  async function unlink() {
    setLinking(true);
    setError(null);
    try {
      await clearGrokKey();
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "没有断开");
    } finally {
      setLinking(false);
    }
  }

  const grokLabel =
    grok === "saved" ? "正在用你保存的密钥" : grok === "env" ? "正在用环境变量里的密钥" : "还没有接入";

  async function copy(code: string) {
    const link = `${window.location.origin}/join/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(code);
      window.setTimeout(() => setCopied((current) => (current === code ? null : current)), 1600);
    } catch {
      setError("复制失败，请手动选择邀请码。");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="rise fixed top-1/2 left-1/2 z-50 max-h-[min(40rem,calc(100dvh-2rem))] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-card p-6 text-ink">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-serif text-2xl font-medium tracking-tight">邀请入席</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted">
                对方用自己的账号登录。这里只有称呼和今天用了几条，没有对话内容。你也看不见他们写了什么。
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid size-11 place-items-center rounded-sm text-muted" aria-label="关闭">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_6rem_auto]">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="备注，例如给小王"
              maxLength={24}
              className="min-h-11 rounded-sm border border-line bg-paper px-3 text-sm"
            />
            <select
              value={maxUses}
              onChange={(event) => setMaxUses(Number(event.target.value))}
              className="min-h-11 rounded-sm border border-line bg-paper px-2 text-sm"
              aria-label="可用次数"
            >
              <option value={1}>1 次</option>
              <option value={5}>5 次</option>
              <option value={10}>10 次</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void make()}
              className="min-h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
            >
              {busy ? "生成中…" : "生成"}
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <h2 className="mt-6 text-sm font-medium">接入你的 Grok</h2>
          <p className="mt-1 text-sm text-muted">
            到{" "}
            <a className="underline underline-offset-4" href="https://console.x.ai/" target="_blank" rel="noreferrer">
              xAI 控制台
            </a>{" "}
            复制 API key。密钥只留在服务器上，朋友看不到。保存之后，对话走你的额度，不再用平台默认的那把。
          </p>
          <p className="mt-2 text-sm">{grokLabel}</p>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="xai-…"
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-sm border border-line bg-paper px-3 text-sm"
            />
            <button
              type="button"
              disabled={linking || apiKey.trim().length < 20}
              onClick={() => void linkKey()}
              className="min-h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
            >
              {linking ? "…" : "保存"}
            </button>
          </div>
          {grok === "saved" ? (
            <button
              type="button"
              disabled={linking}
              onClick={() => void unlink()}
              className="mt-2 text-sm text-muted underline-offset-4 hover:underline"
            >
              改回环境变量里的密钥
            </button>
          ) : null}

          <h2 className="mt-6 text-sm font-medium">邀请码</h2>
          <ul className="mt-2 divide-y divide-line">
            {invites.length === 0 ? <li className="py-3 text-sm text-muted">还没有邀请码。</li> : null}
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm tracking-wide">{invite.code}</p>
                  <p className="text-xs text-muted">
                    {invite.label || "无备注"} · {invite.uses}/{invite.maxUses}
                    {invite.revoked ? " · 已作废" : ""}
                  </p>
                </div>
                {!invite.revoked ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void copy(invite.code)}
                      className="grid size-11 place-items-center rounded-sm text-muted"
                      aria-label="复制链接"
                    >
                      {copied === invite.code ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </button>
                    <button
                      type="button"
                      className="text-sm text-muted underline-offset-4 hover:underline"
                      onClick={() => {
                        void revokeInvite({ data: { inviteId: invite.id } }).then(reload);
                      }}
                    >
                      作废
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>

          <h2 className="mt-6 text-sm font-medium">在席的人</h2>
          <p className="mt-1 text-xs text-muted">只显示称呼和今日条数，不显示他们说了什么。</p>
          <ul className="mt-2 divide-y divide-line">
            {guests.length === 0 ? <li className="py-3 text-sm text-muted">还没有朋友入席。</li> : null}
            {guests.map((guest) => (
              <li key={guest.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{guest.name}</p>
                  <p className="text-xs text-muted tabular-nums">
                    今天 {guest.today} 条{guest.revoked ? " · 已关闭" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm text-muted underline-offset-4 hover:underline"
                  onClick={() => {
                    void setGuestOpen({ data: { guestId: guest.id, open: guest.revoked } }).then(reload);
                  }}
                >
                  {guest.revoked ? "重新打开" : "关闭席位"}
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
