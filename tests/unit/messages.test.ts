import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MESSAGE_MAX_LENGTH,
  codePointLength,
  deliveryStatus,
  latestSeqFrom,
  mergeMessages,
  reconcilePending,
  replySnippet,
  unreadCount,
  validateBody,
  type Message,
} from "@/lib/domain/messages";

const msg = (seq: number, sender: string | null = "a", extra: Partial<Message> = {}): Message => ({
  id: `id-${seq}`,
  seq,
  conversation_id: "c",
  sender_id: sender,
  client_message_id: `client-${seq}`,
  kind: "text",
  body: `m${seq}`,
  created_at: new Date(2026, 0, 1, 12, seq).toISOString(),
  edited_at: null,
  deleted_at: null,
  ...extra,
});

describe("message validation", () => {
  it("counts Unicode code points like Postgres char_length", () => {
    expect(codePointLength("hello")).toBe(5);
    expect(codePointLength("😀")).toBe(1);
    expect("😀".length).toBe(2);
  });

  it("rejects empty and whitespace-only bodies", () => {
    expect(validateBody("   \n\t ")).toEqual({ ok: false, reason: "empty" });
  });

  it("trims surrounding whitespace", () => {
    expect(validateBody("  hi there \n")).toEqual({ ok: true, body: "hi there" });
  });

  it("accepts exactly the limit and rejects one more", () => {
    expect(validateBody("😀".repeat(MESSAGE_MAX_LENGTH)).ok).toBe(true);
    expect(validateBody("a".repeat(MESSAGE_MAX_LENGTH + 1))).toEqual({ ok: false, reason: "too_long" });
  });

  it("keeps the client limit in sync with the database constraint", () => {
    const sql = readFileSync("supabase/migrations/20261106000001_schema.sql", "utf8");
    expect(sql).toContain(`between 1 and ${MESSAGE_MAX_LENGTH}`);
  });
});

describe("mergeMessages", () => {
  it("dedupes by id and orders by seq regardless of arrival order", () => {
    const merged = mergeMessages([msg(3), msg(1)], [msg(2), msg(3), msg(1)]);
    expect(merged.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("applies tombstones and edits", () => {
    const deleted = msg(1, "a", { body: null, deleted_at: new Date().toISOString() });
    expect(mergeMessages([msg(1)], [deleted])[0].deleted_at).not.toBeNull();
  });
});

describe("reconcilePending", () => {
  it("drops optimistic messages once committed", () => {
    const pending = [
      { client_message_id: "client-1", body: "x", created_at: "", status: "sending" as const },
      { client_message_id: "other", body: "y", created_at: "", status: "failed" as const },
    ];
    expect(reconcilePending(pending, [msg(1)]).map((p) => p.client_message_id)).toEqual(["other"]);
  });
});

describe("receipts", () => {
  it("derives sent / delivered / read from the partner cursor", () => {
    const m = msg(5, "me");
    expect(deliveryStatus(m, null)).toBe("sent");
    expect(deliveryStatus(m, { user_id: "p", last_delivered_seq: 4, last_read_seq: 0 })).toBe("sent");
    expect(deliveryStatus(m, { user_id: "p", last_delivered_seq: 5, last_read_seq: 4 })).toBe("delivered");
    expect(deliveryStatus(m, { user_id: "p", last_delivered_seq: 9, last_read_seq: 9 })).toBe("read");
  });

  it("counts unread partner messages after the read cursor", () => {
    const list = [msg(1, "p"), msg(2, "me"), msg(3, "p"), msg(4, "p", { deleted_at: "x", body: null })];
    expect(unreadCount(list, "me", 1)).toBe(1);
    expect(latestSeqFrom(list, "me")).toBe(4);
  });
});

describe("replySnippet", () => {
  it("collapses whitespace and truncates long quotes by code points", () => {
    expect(replySnippet({ body: "Hello\n\n  there", deleted_at: null })).toBe("Hello there");
    const long = replySnippet({ body: "😀".repeat(100), deleted_at: null }, 10);
    expect(Array.from(long)).toHaveLength(10);
    expect(long.endsWith("…")).toBe(true);
  });
  it("handles deleted or unavailable originals", () => {
    expect(replySnippet({ body: null, deleted_at: "2026-01-01" })).toBe("Message deleted");
    expect(replySnippet(undefined)).toBe("Original message unavailable");
  });
});
