"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { errorCodeFrom } from "@/lib/domain/errors";
import {
  PAGE_SIZE,
  latestSeqFrom,
  mergeMessages,
  reconcilePending,
  validateBody,
  type Message,
  type PendingMessage,
  type ReceiptCursor,
} from "@/lib/domain/messages";
import { fireAndForget, getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PartnerStatus, UserSettings } from "@/types/app";

type Connection = "connecting" | "live" | "offline";

interface State {
  status: "loading" | "ready" | "error";
  messages: Message[];
  pending: PendingMessage[];
  hasMoreOlder: boolean;
  loadingOlder: boolean;
  cursors: Record<string, ReceiptCursor>;
  partnerTyping: boolean;
  partnerOnline: boolean;
  partnerLastSeen: string | null;
  lastSeenVisible: boolean;
  connection: Connection;
}

type Action =
  | { type: "initial"; messages: Message[]; cursors: ReceiptCursor[]; hasMoreOlder: boolean }
  | { type: "merge"; messages: Message[] }
  | { type: "older"; messages: Message[]; hasMoreOlder: boolean }
  | { type: "loadingOlder"; value: boolean }
  | { type: "error" }
  | { type: "pendingAdd"; item: PendingMessage }
  | { type: "pendingUpdate"; id: string; patch: Partial<PendingMessage> }
  | { type: "pendingRemove"; id: string }
  | { type: "cursor"; cursor: ReceiptCursor }
  | { type: "typing"; value: boolean }
  | { type: "online"; value: boolean }
  | { type: "lastSeen"; status: PartnerStatus | null }
  | { type: "connection"; value: Connection };

const initialState: State = {
  status: "loading",
  messages: [],
  pending: [],
  hasMoreOlder: false,
  loadingOlder: false,
  cursors: {},
  partnerTyping: false,
  partnerOnline: false,
  partnerLastSeen: null,
  lastSeenVisible: true,
  connection: "connecting",
};

function mergeCursor(prev: ReceiptCursor | undefined, next: ReceiptCursor): ReceiptCursor {
  if (!prev) return next;
  return {
    user_id: next.user_id,
    last_delivered_seq: Math.max(prev.last_delivered_seq, next.last_delivered_seq),
    last_read_seq: Math.max(prev.last_read_seq, next.last_read_seq),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "initial": {
      const messages = mergeMessages(state.messages, action.messages);
      const cursors = { ...state.cursors };
      for (const c of action.cursors) cursors[c.user_id] = mergeCursor(cursors[c.user_id], c);
      return { ...state, status: "ready", messages, cursors, hasMoreOlder: action.hasMoreOlder, pending: reconcilePending(state.pending, messages) };
    }
    case "merge": {
      const messages = mergeMessages(state.messages, action.messages);
      return { ...state, messages, pending: reconcilePending(state.pending, messages) };
    }
    case "older":
      return { ...state, messages: mergeMessages(state.messages, action.messages), hasMoreOlder: action.hasMoreOlder, loadingOlder: false };
    case "loadingOlder":
      return { ...state, loadingOlder: action.value };
    case "error":
      return { ...state, status: "error" };
    case "pendingAdd":
      return { ...state, pending: [...state.pending, action.item] };
    case "pendingUpdate":
      return { ...state, pending: state.pending.map((p) => (p.client_message_id === action.id ? { ...p, ...action.patch } : p)) };
    case "pendingRemove":
      return { ...state, pending: state.pending.filter((p) => p.client_message_id !== action.id) };
    case "cursor":
      return { ...state, cursors: { ...state.cursors, [action.cursor.user_id]: mergeCursor(state.cursors[action.cursor.user_id], action.cursor) } };
    case "typing":
      return state.partnerTyping === action.value ? state : { ...state, partnerTyping: action.value };
    case "online":
      return state.partnerOnline === action.value ? state : { ...state, partnerOnline: action.value };
    case "lastSeen":
      return {
        ...state,
        partnerLastSeen: action.status?.last_seen_at ?? null,
        lastSeenVisible: action.status?.last_seen_visible ?? false,
      };
    case "connection":
      return { ...state, connection: action.value };
  }
}

export interface ConversationValue extends State {
  conversationId: string;
  userId: string;
  partnerId: string;
  unread: number;
  /** Whether the partner's online state may be shown (reciprocal visibility). */
  showPresence: boolean;
  send: (text: string) => Promise<boolean>;
  retry: (clientMessageId: string) => Promise<void>;
  discard: (clientMessageId: string) => void;
  loadOlder: () => Promise<void>;
  markRead: () => void;
  notifyTyping: () => void;
  stopTyping: () => void;
  setChatOpen: (open: boolean) => void;
}

const ConversationContext = createContext<ConversationValue | null>(null);

export function useConversation(): ConversationValue {
  const value = use(ConversationContext);
  if (!value) throw new Error("useConversation must be used inside <ConversationProvider>");
  return value;
}

export function useOptionalConversation(): ConversationValue | null {
  return use(ConversationContext);
}

const MESSAGE_COLUMNS = "id, seq, conversation_id, sender_id, client_message_id, kind, body, created_at, edited_at, deleted_at";

function isMessagePayload(value: unknown, conversationId: string): value is Message {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<Message>;
  return (
    typeof m.id === "string" &&
    typeof m.seq === "number" &&
    m.conversation_id === conversationId &&
    typeof m.client_message_id === "string" &&
    typeof m.created_at === "string"
  );
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio may be blocked until the user interacts with the page.
  }
}

interface ProviderProps {
  conversationId: string;
  userId: string;
  partnerId: string;
  partnerName: string;
  settings: UserSettings;
  children: ReactNode;
}

/**
 * Owns the couple conversation: initial load + pagination from Postgres, live updates over
 * private Realtime channels, gap-fill after reconnects, receipts, typing and presence.
 * Postgres is the source of truth; Realtime only accelerates delivery.
 */
export function ConversationProvider({ conversationId, userId, partnerId, partnerName, settings, children }: ProviderProps) {
  const supabase = getSupabaseBrowserClient();
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  // Keep refs current for async callbacks (updated after render, never during it).
  useLayoutEffect(() => {
    stateRef.current = state;
    settingsRef.current = settings;
  });

  const liveChannelRef = useRef<RealtimeChannel | null>(null);
  const chatOpenRef = useRef(false);
  const deliveredSentRef = useRef(0);
  const readSentRef = useRef(0);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const trackingRef = useRef(false);

  const fetchSince = useCallback(
    async (afterSeq: number) => {
      let cursor = afterSeq;
      for (let i = 0; i < 20; i++) {
        const { data, error } = await supabase
          .from("messages")
          .select(MESSAGE_COLUMNS)
          .eq("conversation_id", conversationId)
          .gt("seq", cursor)
          .order("seq", { ascending: true })
          .limit(200);
        if (error || !data?.length) return;
        dispatch({ type: "merge", messages: data as Message[] });
        cursor = (data[data.length - 1] as Message).seq;
        if (data.length < 200) return;
      }
    },
    [supabase, conversationId],
  );

  const gapFill = useCallback(async () => {
    const s = stateRef.current;
    if (s.status !== "ready") return;
    const last = s.messages.length ? s.messages[s.messages.length - 1].seq : 0;
    await fetchSince(last);
    const { data } = await supabase.from("message_reads").select("user_id, last_delivered_seq, last_read_seq").eq("conversation_id", conversationId);
    for (const c of (data ?? []) as ReceiptCursor[]) dispatch({ type: "cursor", cursor: c });
  }, [fetchSince, supabase, conversationId]);

  const loadPartnerStatus = useCallback(async () => {
    const { data } = await supabase.rpc("get_partner_status");
    dispatch({ type: "lastSeen", status: (data as PartnerStatus | null) ?? null });
  }, [supabase]);

  // Initial load from Postgres.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [msgs, reads] = await Promise.all([
        supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", conversationId).order("seq", { ascending: false }).limit(PAGE_SIZE),
        supabase.from("message_reads").select("user_id, last_delivered_seq, last_read_seq").eq("conversation_id", conversationId),
      ]);
      if (cancelled) return;
      if (msgs.error || reads.error) {
        dispatch({ type: "error" });
        return;
      }
      const rows = (msgs.data as Message[]).reverse();
      dispatch({ type: "initial", messages: rows, cursors: reads.data as ReceiptCursor[], hasMoreOlder: rows.length === PAGE_SIZE });
    })();
    void loadPartnerStatus();
    return () => {
      cancelled = true;
    };
  }, [supabase, conversationId, loadPartnerStatus]);

  // Realtime: DB-originated events (receive only) + live channel (typing/presence).
  useEffect(() => {
    let events: RealtimeChannel | null = null;
    let live: RealtimeChannel | null = null;
    let cancelled = false;

    const onIncoming = (message: Message) => {
      dispatch({ type: "merge", messages: [message] });
      if (message.sender_id === partnerId) {
        dispatch({ type: "typing", value: false });
        if (document.visibilityState !== "visible") {
          const prefs = settingsRef.current;
          if (prefs.notify_sound) playChime();
          if (prefs.notify_desktop && "Notification" in window && Notification.permission === "granted") {
            // Privacy: never put message content in OS notifications.
            new Notification(partnerName, { body: "New message", tag: `kindchat-${conversationId}` });
          }
        }
      }
    };

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      events = supabase
        .channel(`conversation:${conversationId}`, { config: { private: true } })
        .on("broadcast", { event: "message.created" }, ({ payload }) => {
          if (isMessagePayload(payload, conversationId)) onIncoming(payload);
        })
        .on("broadcast", { event: "message.updated" }, ({ payload }) => {
          if (isMessagePayload(payload, conversationId)) dispatch({ type: "merge", messages: [payload] });
        })
        .on("broadcast", { event: "receipt.updated" }, ({ payload }) => {
          const p = payload as Partial<ReceiptCursor> & { conversation_id?: string };
          if (p.conversation_id === conversationId && typeof p.user_id === "string") {
            dispatch({
              type: "cursor",
              cursor: { user_id: p.user_id, last_delivered_seq: Number(p.last_delivered_seq ?? 0), last_read_seq: Number(p.last_read_seq ?? 0) },
            });
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            dispatch({ type: "connection", value: "live" });
            void gapFill();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            dispatch({ type: "connection", value: "offline" });
          }
        });

      live = supabase
        .channel(`conversation:${conversationId}:live`, {
          config: { private: true, broadcast: { self: false }, presence: { key: userId } },
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const p = payload as { user_id?: string; state?: string };
          if (p.user_id !== partnerId) return;
          if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
          if (p.state === "start") {
            dispatch({ type: "typing", value: true });
            typingTimeoutRef.current = window.setTimeout(() => dispatch({ type: "typing", value: false }), 6000);
          } else {
            dispatch({ type: "typing", value: false });
          }
        })
        .on("presence", { event: "sync" }, () => {
          const presence = live?.presenceState() ?? {};
          const online = Object.prototype.hasOwnProperty.call(presence, partnerId);
          dispatch({ type: "online", value: online });
          if (!online) void loadPartnerStatus();
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && settingsRef.current.show_online_status && live) {
            await live.track({ user_id: userId, online_at: new Date().toISOString() });
            trackingRef.current = true;
          }
        });
      liveChannelRef.current = live;
    })();

    return () => {
      cancelled = true;
      liveChannelRef.current = null;
      trackingRef.current = false;
      if (events) void supabase.removeChannel(events);
      if (live) void supabase.removeChannel(live);
    };
  }, [supabase, conversationId, userId, partnerId, partnerName, gapFill, loadPartnerStatus]);

  // Respect online-visibility changes without reconnecting.
  useEffect(() => {
    const live = liveChannelRef.current;
    if (!live) return;
    if (settings.show_online_status && !trackingRef.current) {
      void live.track({ user_id: userId, online_at: new Date().toISOString() });
      trackingRef.current = true;
    } else if (!settings.show_online_status && trackingRef.current) {
      void live.untrack();
      trackingRef.current = false;
    }
  }, [settings.show_online_status, userId]);

  // Never trust Realtime alone: refill gaps when the tab wakes up or the network returns.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") {
        void gapFill();
        void loadPartnerStatus();
      }
    };
    const onOnline = () => {
      dispatch({ type: "connection", value: "connecting" });
      void gapFill();
    };
    const onOffline = () => dispatch({ type: "connection", value: "offline" });
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const statusInterval = window.setInterval(() => {
      if (!stateRef.current.partnerOnline) void loadPartnerStatus();
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(statusInterval);
    };
  }, [gapFill, loadPartnerStatus]);

  // Delivery acknowledgement: this device has received the partner's messages.
  const latestPartnerSeq = latestSeqFrom(state.messages, userId);
  const myCursor = state.cursors[userId];
  useEffect(() => {
    if (!latestPartnerSeq) return;
    if (latestPartnerSeq <= (myCursor?.last_delivered_seq ?? 0) || latestPartnerSeq <= deliveredSentRef.current) return;
    const timer = window.setTimeout(() => {
      deliveredSentRef.current = latestPartnerSeq;
      fireAndForget(supabase.rpc("mark_delivered", { p_conversation_id: conversationId, p_seq: latestPartnerSeq }), "mark_delivered");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [latestPartnerSeq, myCursor?.last_delivered_seq, supabase, conversationId]);

  const markRead = useCallback(() => {
    const s = stateRef.current;
    if (!chatOpenRef.current || document.visibilityState !== "visible" || !document.hasFocus()) return;
    const latest = latestSeqFrom(s.messages, userId);
    const mine = s.cursors[userId];
    if (!latest || latest <= (mine?.last_read_seq ?? 0) || latest <= readSentRef.current) return;
    readSentRef.current = latest;
    dispatch({ type: "cursor", cursor: { user_id: userId, last_delivered_seq: latest, last_read_seq: latest } });
    fireAndForget(supabase.rpc("mark_read", { p_conversation_id: conversationId, p_seq: latest }), "mark_read");
  }, [supabase, conversationId, userId]);

  const stopTyping = useCallback(() => {
    if (!lastTypingSentRef.current) return;
    lastTypingSentRef.current = 0;
    void liveChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { user_id: userId, state: "stop" } });
  }, [userId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    void liveChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { user_id: userId, state: "start" } });
  }, [userId]);

  const deliver = useCallback(
    async (clientMessageId: string, body: string) => {
      const { data, error } = await supabase.rpc("send_message", {
        p_conversation_id: conversationId,
        p_body: body,
        p_client_message_id: clientMessageId,
      });
      if (error || !data) {
        dispatch({ type: "pendingUpdate", id: clientMessageId, patch: { status: "failed", error: errorCodeFrom(error) } });
        return;
      }
      // Server acknowledgement: the committed row (id, seq, created_at).
      dispatch({ type: "merge", messages: [data as Message] });
    },
    [supabase, conversationId],
  );

  const send = useCallback(
    async (text: string) => {
      const validation = validateBody(text);
      if (!validation.ok) return false;
      const clientMessageId = crypto.randomUUID();
      dispatch({
        type: "pendingAdd",
        item: { client_message_id: clientMessageId, body: validation.body, created_at: new Date().toISOString(), status: "sending" },
      });
      stopTyping();
      await deliver(clientMessageId, validation.body);
      return true;
    },
    [deliver, stopTyping],
  );

  const retry = useCallback(
    async (clientMessageId: string) => {
      const item = stateRef.current.pending.find((p) => p.client_message_id === clientMessageId);
      if (!item) return;
      dispatch({ type: "pendingUpdate", id: clientMessageId, patch: { status: "sending", error: undefined } });
      // Same client_message_id => idempotent on the server, no duplicates.
      await deliver(clientMessageId, item.body);
    },
    [deliver],
  );

  const discard = useCallback((clientMessageId: string) => dispatch({ type: "pendingRemove", id: clientMessageId }), []);

  const loadOlder = useCallback(async () => {
    const s = stateRef.current;
    if (s.loadingOlder || !s.hasMoreOlder || !s.messages.length) return;
    dispatch({ type: "loadingOlder", value: true });
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .lt("seq", s.messages[0].seq)
      .order("seq", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      dispatch({ type: "loadingOlder", value: false });
      return;
    }
    dispatch({ type: "older", messages: (data as Message[]).reverse(), hasMoreOlder: data.length === PAGE_SIZE });
  }, [supabase, conversationId]);

  const setChatOpen = useCallback((open: boolean) => {
    chatOpenRef.current = open;
  }, []);

  const unread = useMemo(() => {
    const lastRead = state.cursors[userId]?.last_read_seq ?? 0;
    return state.messages.filter((m) => m.sender_id === partnerId && !m.deleted_at && m.seq > lastRead).length;
  }, [state.messages, state.cursors, userId, partnerId]);

  // Unread badge in the tab title.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = unread > 0 ? `(${unread >= PAGE_SIZE ? `${PAGE_SIZE}+` : unread}) ${base}` : base;
  }, [unread]);

  const value = useMemo<ConversationValue>(
    () => ({
      ...state,
      conversationId,
      userId,
      partnerId,
      unread,
      showPresence: settings.show_online_status,
      send,
      retry,
      discard,
      loadOlder,
      markRead,
      notifyTyping,
      stopTyping,
      setChatOpen,
    }),
    [state, conversationId, userId, partnerId, unread, settings.show_online_status, send, retry, discard, loadOlder, markRead, notifyTyping, stopTyping, setChatOpen],
  );

  return <ConversationContext value={value}>{children}</ConversationContext>;
}
