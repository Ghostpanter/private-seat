import { getSql } from "@/lib/db";
import { getRequest } from "@tanstack/react-start/server";
import { DAILY_CAP, GLOBAL_CAP, MAX_INPUT, tokyoDay } from "@/lib/seat/limits";
import type {
  GuestRow,
  InviteRow,
  MessageRow,
  SeatState,
  ThreadRow,
} from "@/lib/seat/types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function browserViewForRequest(): string | null {
  if (!process.env.GROK_BROWSER_CDP?.trim()) return null;
  const pinned = process.env.GROK_BROWSER_VIEW?.trim() ?? "";
  if (pinned && !/localhost|127\.0\.0\.1/.test(pinned)) return pinned;
  try {
    const host = getRequest().headers.get("host") ?? "";
    const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    if (!hostname) return pinned || null;
    return `http://${hostname}:6080/vnc.html`;
  } catch {
    return pinned || null;
  }
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return "";
}

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function makeCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

function clipTitle(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length <= 18 ? flat || "新对话" : `${flat.slice(0, 18)}…`;
}

async function profileName(userId: string): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ name: string | null }>`
    select name from "user" where id = ${userId} limit 1
  `;
  const name = rows[0]?.name?.trim();
  return name || "未命名";
}

type MemberRow = {
  role: string;
  revoked_at: unknown;
  display_name: string | null;
};

export async function ensureSeat(userId: string): Promise<SeatState> {
  const sql = await getSql();
  const name = await profileName(userId);
  let rows = await sql<MemberRow>`
    select role, revoked_at, display_name from members where user_id = ${userId} limit 1
  `;

  if (!rows[0]) {
    try {
      await sql`
        insert into members (user_id, role, display_name)
        select ${userId}, 'host', ${name}
        where not exists (select 1 from members where role = 'host')
      `;
    } catch {
      /* another request claimed the host seat */
    }
    rows = await sql<MemberRow>`
      select role, revoked_at, display_name from members where user_id = ${userId} limit 1
    `;
  } else if (name !== "未命名" && rows[0].display_name !== name) {
    await sql`update members set display_name = ${name} where user_id = ${userId}`;
  }

  const member = rows[0];
  let role: SeatState["role"] = "pending";
  if (member?.role === "host") role = "host";
  else if (member?.role === "guest" && member.revoked_at) role = "revoked";
  else if (member?.role === "guest") role = "guest";

  const day = tokyoDay();
  const usedRows = await sql<{ turns: unknown }>`
    select turns from usage_daily where user_id = ${userId} and day = ${day}
  `;
  const globalRows = await sql<{ n: unknown }>`
    select coalesce(sum(turns), 0) as n from usage_daily where day = ${day}
  `;

  const linkRows = await sql<{ api_key: string }>`
    select api_key from grok_link where id = 1
  `.catch(() => [] as { api_key: string }[]);
  const saved = Boolean(linkRows[0]?.api_key?.trim());
  const grok = saved ? "saved" : process.env.XAI_API_KEY?.trim() ? "env" : "none";

  return {
    role,
    name: member?.display_name?.trim() || name,
    todayUsed: asInt(usedRows[0]?.turns),
    dailyCap: DAILY_CAP,
    globalUsed: asInt(globalRows[0]?.n),
    globalCap: GLOBAL_CAP,
    grok,
    browser: Boolean(process.env.GROK_BROWSER_CDP?.trim()),
    browserView: browserViewForRequest(),
  };
}

async function requireHost(userId: string): Promise<SeatState> {
  const seat = await ensureSeat(userId);
  if (seat.role !== "host") throw new Error("只有席主可以管理邀请");
  return seat;
}

function assertActive(seat: SeatState): string | null {
  if (seat.role === "host" || seat.role === "guest") return null;
  if (seat.role === "revoked") return "席位已关闭。向席主要一个新的邀请码就能回来。";
  return "需要邀请码才能开始。你的对话不会进入别人的记录。";
}

export async function listThreads(userId: string): Promise<ThreadRow[]> {
  const seat = await ensureSeat(userId);
  if (assertActive(seat)) return [];
  const sql = await getSql();
  const rows = await sql<{ id: string; title: string; updated_at: unknown }>`
    select id, title, updated_at from threads
    where user_id = ${userId}
    order by updated_at desc
    limit 80
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: asIso(row.updated_at),
  }));
}

export async function getMessages(userId: string, threadId: string): Promise<MessageRow[]> {
  const seat = await ensureSeat(userId);
  if (assertActive(seat)) return [];
  const sql = await getSql();
  const owned = await sql<{ id: string }>`
    select id from threads where id = ${threadId} and user_id = ${userId} limit 1
  `;
  if (!owned[0]) return [];
  const rows = await sql<{ id: string; role: "user" | "assistant"; content: string }>`
    select id, role, content from messages
    where thread_id = ${threadId} and user_id = ${userId}
    order by created_at asc
  `;
  return rows.map((row) => ({ id: row.id, role: row.role, content: row.content }));
}

export async function removeThread(userId: string, threadId: string): Promise<void> {
  const seat = await ensureSeat(userId);
  if (assertActive(seat)) throw new Error("没有可用的席位");
  const sql = await getSql();
  await sql`delete from messages where thread_id = ${threadId} and user_id = ${userId}`;
  await sql`delete from threads where id = ${threadId} and user_id = ${userId}`;
}

export async function listInvites(userId: string): Promise<InviteRow[]> {
  await requireHost(userId);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    code: string;
    label: string;
    max_uses: unknown;
    uses: unknown;
    revoked_at: unknown;
  }>`
    select id, code, label, max_uses, uses, revoked_at
    from invites
    where created_by = ${userId}
    order by created_at desc
    limit 30
  `;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    maxUses: asInt(row.max_uses),
    uses: asInt(row.uses),
    revoked: Boolean(row.revoked_at),
  }));
}

export async function createInvite(
  userId: string,
  maxUses: number,
  label: string,
): Promise<InviteRow> {
  await requireHost(userId);
  const uses = Math.min(20, Math.max(1, Math.floor(maxUses) || 1));
  const note = label.trim().slice(0, 24);
  const sql = await getSql();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = makeCode();
    const id = crypto.randomUUID();
    try {
      await sql`
        insert into invites (id, code, created_by, label, max_uses)
        values (${id}, ${code}, ${userId}, ${note}, ${uses})
      `;
      return { id, code, label: note, maxUses: uses, uses: 0, revoked: false };
    } catch {
      /* code collision — try again */
    }
  }
  throw new Error("邀请码没有生成成功，请再试一次");
}

export async function revokeInvite(userId: string, inviteId: string): Promise<void> {
  await requireHost(userId);
  const sql = await getSql();
  await sql`
    update invites set revoked_at = now()
    where id = ${inviteId} and created_by = ${userId} and revoked_at is null
  `;
}

export async function listGuests(userId: string): Promise<GuestRow[]> {
  await requireHost(userId);
  const sql = await getSql();
  const day = tokyoDay();
  const rows = await sql<{
    user_id: string;
    display_name: string | null;
    joined_at: unknown;
    revoked_at: unknown;
    turns: unknown;
  }>`
    select m.user_id, m.display_name, m.joined_at, m.revoked_at, u.turns
    from members m
    left join usage_daily u on u.user_id = m.user_id and u.day = ${day}
    where m.role = 'guest'
    order by m.joined_at desc
  `;
  return rows.map((row) => ({
    id: row.user_id,
    name: row.display_name?.trim() || "未命名",
    joinedAt: asIso(row.joined_at),
    today: asInt(row.turns),
    revoked: Boolean(row.revoked_at),
  }));
}

export async function setGuestRevoked(
  userId: string,
  guestId: string,
  revoked: boolean,
): Promise<void> {
  await requireHost(userId);
  if (guestId === userId) throw new Error("不能关闭自己");
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    update members
    set revoked_at = ${revoked ? new Date().toISOString() : null}
    where user_id = ${guestId} and role = 'guest'
    returning user_id
  `;
  if (!rows[0]) throw new Error("没有这个席位");
}

export async function redeemCode(
  userId: string,
  rawCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z2-9]{6,12}$/.test(code)) return { ok: false, error: "邀请码格式不对" };

  const seat = await ensureSeat(userId);
  if (seat.role === "host" || seat.role === "guest") return { ok: true };

  const sql = await getSql();
  const updated = await sql<{ id: string }>`
    update invites
    set uses = uses + 1
    where code = ${code} and revoked_at is null and uses < max_uses
    returning id
  `;
  if (!updated[0]) return { ok: false, error: "邀请码无效、已用完或已作废" };

  const name = await profileName(userId);
  await sql`
    insert into members (user_id, role, display_name)
    values (${userId}, 'guest', ${name})
    on conflict (user_id) do update
      set role = 'guest',
          display_name = excluded.display_name,
          revoked_at = null,
          joined_at = now()
      where members.role <> 'host'
  `;
  return { ok: true };
}

export type PreparedTurn =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      threadId: string;
      title: string;
      history: { role: "user" | "assistant"; content: string }[];
    };

export async function prepareTurn(
  userId: string,
  threadId: string | null,
  rawContent: string,
): Promise<PreparedTurn> {
  const content = rawContent.replace(/\u0000/g, "").trim();
  if (!content) return { ok: false, status: 400, error: "先写点什么" };
  if (content.length > MAX_INPUT) {
    return { ok: false, status: 400, error: `一条最多 ${MAX_INPUT} 字` };
  }

  const seat = await ensureSeat(userId);
  const blocked = assertActive(seat);
  if (blocked) return { ok: false, status: 403, error: blocked };
  if (seat.todayUsed >= DAILY_CAP) {
    return { ok: false, status: 429, error: "你今天的额度用完了，明天再来。" };
  }
  if (seat.globalUsed >= GLOBAL_CAP) {
    return { ok: false, status: 429, error: "今天的共享额度用完了，明天会恢复。" };
  }

  const sql = await getSql();
  let id = threadId;
  let title = clipTitle(content);
  if (id) {
    const owned = await sql<{ id: string; title: string }>`
      select id, title from threads where id = ${id} and user_id = ${userId} limit 1
    `;
    if (!owned[0]) return { ok: false, status: 404, error: "找不到这席对话" };
    title = owned[0].title === "新对话" ? clipTitle(content) : owned[0].title;
  } else {
    id = crypto.randomUUID();
    await sql`
      insert into threads (id, user_id, title) values (${id}, ${userId}, ${title})
    `;
  }

  const messageId = crypto.randomUUID();
  await sql`
    insert into messages (id, thread_id, user_id, role, content)
    values (${messageId}, ${id}, ${userId}, 'user', ${content})
  `;
  await sql`
    update threads
    set updated_at = now(), title = ${title}
    where id = ${id} and user_id = ${userId}
  `;

  const day = tokyoDay();
  await sql`
    insert into usage_daily (user_id, day, turns) values (${userId}, ${day}, 1)
    on conflict (user_id, day) do update set turns = usage_daily.turns + 1
  `;

  const rows = await sql<{ role: "user" | "assistant"; content: string }>`
    select role, content from messages
    where thread_id = ${id} and user_id = ${userId}
    order by created_at asc
  `;
  const history = rows.slice(-12).map((row) => ({
    role: row.role,
    content: row.content.slice(0, MAX_INPUT),
  }));

  return { ok: true, threadId: id, title, history };
}

export async function saveAssistant(
  userId: string,
  threadId: string,
  content: string,
): Promise<void> {
  const text = content.trim();
  if (!text) return;
  const sql = await getSql();
  const owned = await sql<{ id: string }>`
    select id from threads where id = ${threadId} and user_id = ${userId} limit 1
  `;
  if (!owned[0]) return;
  await sql`
    insert into messages (id, thread_id, user_id, role, content)
    values (${crypto.randomUUID()}, ${threadId}, ${userId}, 'assistant', ${text})
  `;
  await sql`
    update threads set updated_at = now() where id = ${threadId} and user_id = ${userId}
  `;
}

export async function resolveGrokKey(): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ api_key: string }>`
    select api_key from grok_link where id = 1
  `.catch(() => [] as { api_key: string }[]);
  const saved = rows[0]?.api_key?.trim();
  if (saved) return saved;
  const fromEnv = process.env.XAI_API_KEY?.trim();
  return fromEnv || null;
}

export async function saveGrokKey(userId: string, raw: string): Promise<void> {
  await requireHost(userId);
  const key = raw.trim();
  if (!/^[A-Za-z0-9_\-.]{20,200}$/.test(key)) throw new Error("密钥格式不对");
  const probe = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!probe.ok) throw new Error("这把密钥连不上 Grok");
  const sql = await getSql();
  await sql`
    insert into grok_link (id, api_key) values (1, ${key})
    on conflict (id) do update set api_key = excluded.api_key, updated_at = now()
  `;
}

export async function clearGrokKey(userId: string): Promise<void> {
  await requireHost(userId);
  const sql = await getSql();
  await sql`delete from grok_link where id = 1`;
}

export async function refundTurn(userId: string): Promise<void> {
  const sql = await getSql();
  const day = tokyoDay();
  await sql`
    update usage_daily
    set turns = greatest(turns - 1, 0)
    where user_id = ${userId} and day = ${day}
  `;
}
