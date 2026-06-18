// Minimal presence server built on `ws`. Supports multiple rooms, validates
// client input, and prunes dead connections with a ping/pong heartbeat.
import { WebSocketServer, WebSocket } from "ws";
import { Peer, ServerMessage, encode, decode, nextId, validateClientMessage } from "./protocol.js";

interface Conn { sock: WebSocket; room: string; alive: boolean; }

export interface PresenceServer {
  wss: WebSocketServer;
  peers: Map<string, Peer>;
  close: () => Promise<void>;
}

export function createServer(
  opts: { port?: number; server?: any; heartbeatMs?: number } = {}
): PresenceServer {
  const wss = new WebSocketServer(opts.server ? { server: opts.server } : { port: opts.port ?? 8787 });
  const peers = new Map<string, Peer>();
  const conns = new Map<string, Conn>();

  const roomPeers = (room: string): Peer[] => [...peers.values()].filter((p) => p.room === room);

  function broadcast(room: string, msg: ServerMessage, exceptId?: string) {
    const data = encode(msg);
    for (const [id, c] of conns) {
      if (c.room === room && id !== exceptId && c.sock.readyState === c.sock.OPEN) c.sock.send(data);
    }
  }

  function cleanup(id: string) {
    const c = conns.get(id);
    if (!c) return;
    conns.delete(id);
    if (peers.delete(id)) broadcast(c.room, { t: "left", id });  // only announce peers that had joined
  }

  wss.on("connection", (sock: WebSocket) => {
    const id = nextId();
    conns.set(id, { sock, room: "default", alive: true });
    sock.send(encode({ t: "welcome", id }));

    sock.on("pong", () => { const c = conns.get(id); if (c) c.alive = true; });

    sock.on("message", (raw: Buffer) => {
      const msg = validateClientMessage(decode(raw.toString()));
      const c = conns.get(id);
      if (!msg || !c) return;
      if (msg.t === "join") {
        c.room = msg.room ?? "default";
        peers.set(id, { id, name: msg.name, color: msg.color, cursor: null, room: c.room });
        broadcast(c.room, { t: "presence", peers: roomPeers(c.room) });
      } else if (msg.t === "move") {
        const p = peers.get(id);
        if (p) { p.cursor = msg.cursor; broadcast(c.room, { t: "moved", id, cursor: msg.cursor }, id); }
      } else if (msg.t === "leave") {
        cleanup(id);
      }
    });

    sock.on("close", () => cleanup(id));
  });

  // Heartbeat: a connection that misses a pong between cycles is terminated and
  // its peer pruned — otherwise a dropped network leaves a ghost cursor forever.
  const timer = setInterval(() => {
    for (const [id, c] of conns) {
      if (!c.alive) { c.sock.terminate(); cleanup(id); continue; }
      c.alive = false;
      try { c.sock.ping(); } catch { /* socket already dying */ }
    }
  }, opts.heartbeatMs ?? 30000);
  if (typeof (timer as any).unref === "function") (timer as any).unref();

  return {
    wss, peers,
    close: () => new Promise((res) => { clearInterval(timer); wss.close(() => res()); }),
  };
}
