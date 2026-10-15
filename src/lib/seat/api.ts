import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  createInvite as makeInvite,
  ensureSeat,
  getMessages as loadMessages,
  listGuests as loadGuests,
  listInvites as loadInvites,
  listThreads as loadThreads,
  redeemCode,
  removeThread,
  revokeInvite as dropInvite,
  saveGrokKey as writeGrokKey,
  clearGrokKey as dropGrokKey,
  setGuestRevoked,
} from "@/lib/seat/access.server";

export const getSeat = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return ensureSeat(context.userId);
  });

export const listThreads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return loadThreads(context.userId);
  });

export const getMessages = createServerFn({ method: "POST" })
  .validator((input: { threadId: string }) => {
    const threadId = String(input?.threadId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw new Error("对话不存在");
    return { threadId };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    return loadMessages(context.userId, data.threadId);
  });

export const deleteThread = createServerFn({ method: "POST" })
  .validator((input: { threadId: string }) => {
    const threadId = String(input?.threadId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw new Error("对话不存在");
    return { threadId };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await removeThread(context.userId, data.threadId);
    return { ok: true as const };
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return loadInvites(context.userId);
  });

export const createInvite = createServerFn({ method: "POST" })
  .validator((input: { maxUses?: number; label?: string }) => ({
    maxUses: Number(input?.maxUses ?? 1),
    label: String(input?.label ?? ""),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    return makeInvite(context.userId, data.maxUses, data.label);
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .validator((input: { inviteId: string }) => ({
    inviteId: String(input?.inviteId ?? ""),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await dropInvite(context.userId, data.inviteId);
    return { ok: true as const };
  });

export const listGuests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return loadGuests(context.userId);
  });

export const setGuestOpen = createServerFn({ method: "POST" })
  .validator((input: { guestId: string; open: boolean }) => ({
    guestId: String(input?.guestId ?? ""),
    open: Boolean(input?.open),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await setGuestRevoked(context.userId, data.guestId, !data.open);
    return { ok: true as const };
  });

export const redeemInvite = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => ({
    code: String(input?.code ?? ""),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    return redeemCode(context.userId, data.code);
  });

export const saveGrokKey = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => ({ key: String(input?.key ?? "") }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await writeGrokKey(context.userId, data.key);
    return { ok: true as const };
  });

export const clearGrokKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await dropGrokKey(context.userId);
    return { ok: true as const };
  });
