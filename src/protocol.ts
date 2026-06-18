// Wire protocol + presence state — pure and transport-agnostic (testable).
export type Cursor = { x: number; y: number };

export type ClientMessage =
  | { t: "join"; name: string; color: string; room?: string }
  | { t: "move"; cursor: Cursor }
  | { t: "leave" };

export type ServerMessage =
  | { t: "welcome"; id: string }
  | { t: "presence"; peers: Peer[] }       // full snapshot
  | { t: "moved"; id: string; cursor: Cursor }
  | { t: "left"; id: string };

export interface Peer {
  id: string;
  name: string;
  color: string;
  cursor: Cursor | null;
  room?: string;
}

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decode<T = ClientMessage | ServerMessage>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

const MAX_NAME = 64;

/** Validate + sanitize an untrusted client message. Returns a clean message or
 *  null — so the server never broadcasts malformed input (e.g. a non-numeric
 *  cursor or a join with no name) to other peers. */
export function validateClientMessage(m: any): ClientMessage | null {
  if (!m || typeof m !== "object" || typeof m.t !== "string") return null;
  if (m.t === "join") {
    if (typeof m.name !== "string" || typeof m.color !== "string" || !m.name) return null;
    const out: ClientMessage = { t: "join", name: m.name.slice(0, MAX_NAME), color: m.color.slice(0, 32) };
    if (typeof m.room === "string" && m.room) out.room = m.room.slice(0, MAX_NAME);
    return out;
  }
  if (m.t === "move") {
    const c = m.cursor;
    if (!c || typeof c.x !== "number" || typeof c.y !== "number"
        || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
    return { t: "move", cursor: { x: c.x, y: c.y } };
  }
  if (m.t === "leave") return { t: "leave" };
  return null;
}

// Reducer the client uses to keep a map of peers in sync from server messages.
export function applyServerMessage(
  peers: Record<string, Peer>,
  msg: ServerMessage
): Record<string, Peer> {
  switch (msg.t) {
    case "presence": {
      const next: Record<string, Peer> = {};
      for (const p of msg.peers) next[p.id] = p;
      return next;
    }
    case "moved": {
      const existing = peers[msg.id];
      if (!existing) return peers;
      return { ...peers, [msg.id]: { ...existing, cursor: msg.cursor } };
    }
    case "left": {
      if (!peers[msg.id]) return peers;
      const next = { ...peers };
      delete next[msg.id];
      return next;
    }
    default:
      return peers;
  }
}

let _counter = 0;
export function nextId(prefix = "u"): string {
  _counter += 1;
  return `${prefix}_${_counter}_${Math.random().toString(36).slice(2, 7)}`;
}
