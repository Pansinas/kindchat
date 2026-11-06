/** Pure messaging domain logic: no React, Next.js or Supabase imports (reusable on mobile). */

export const MESSAGE_MAX_LENGTH = 5000; // Unicode code points; must match messages_body_rules
export const PAGE_SIZE = 50;

export interface Message {
  id: string;
  seq: number;
  conversation_id: string;
  sender_id: string | null;
  client_message_id: string;
  kind: "text";
  body: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface PendingMessage {
  client_message_id: string;
  body: string;
  created_at: string;
  status: "sending" | "failed";
  error?: string;
}

export interface ReceiptCursor {
  user_id: string;
  last_delivered_seq: number;
  last_read_seq: number;
}

export type DeliveryStatus = "sending" | "failed" | "sent" | "delivered" | "read";

/** Length in Unicode code points (same unit as Postgres char_length). */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function normaliseBody(text: string): string {
  return text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

export type BodyValidation = { ok: true; body: string } | { ok: false; reason: "empty" | "too_long" };

export function validateBody(text: string): BodyValidation {
  const body = normaliseBody(text);
  const length = codePointLength(body);
  if (length === 0) return { ok: false, reason: "empty" };
  if (length > MESSAGE_MAX_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, body };
}

/** Merge rows from any source (RPC ack, Realtime, pagination, gap-fill): dedupe by id, order by seq. */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<string, Message>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) {
    const prev = byId.get(m.id);
    // Keep the most recent version (edits/tombstones arrive as updates).
    if (!prev || (m.edited_at ?? "") >= (prev.edited_at ?? "") || m.deleted_at) byId.set(m.id, { ...m, seq: Number(m.seq) });
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/** Drop optimistic placeholders once their committed row is present. */
export function reconcilePending(pending: PendingMessage[], committed: Message[]): PendingMessage[] {
  if (pending.length === 0) return pending;
  const confirmed = new Set(committed.map((m) => m.client_message_id));
  return pending.filter((p) => !confirmed.has(p.client_message_id));
}

export function deliveryStatus(message: Message, partner: ReceiptCursor | null): DeliveryStatus {
  if (!partner) return "sent";
  if (partner.last_read_seq >= message.seq) return "read";
  if (partner.last_delivered_seq >= message.seq) return "delivered";
  return "sent";
}

export function latestSeqFrom(messages: Message[], senderNot: string): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender_id !== senderNot) return messages[i].seq;
  }
  return 0;
}

export function unreadCount(messages: Message[], myId: string, myLastReadSeq: number): number {
  return messages.filter((m) => m.sender_id !== myId && !m.deleted_at && m.seq > myLastReadSeq).length;
}

export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
