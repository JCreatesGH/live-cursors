// Minimal presence server built on `ws`. One room per server instance for clarity.
import { WebSocketServer, WebSocket } from "ws";
import { Peer, ServerMessage, ClientMessage, encode, decode, nextId } from "./protocol.js";

export interface PresenceServer {
  wss: WebSocketServer;
  peers: Map<string, Peer>;
  close: () => Promise<void>;
}

export function createServer(opts: { port?: number; server?: any } = {}): PresenceServer {
  const wss = new WebSocketServer(opts.server ? { server: opts.server } : { port: opts.port ?? 8787 });
  const peers = new Map<string, Peer>();
  const sockets = new Map<string, WebSocket>();

  function broadcast(msg: ServerMessage, exceptId?: string) {
    const data = encode(msg);
    for (const [id, sock] of sockets) {
      if (id !== exceptId && sock.readyState === sock.OPEN) sock.send(data);
    }
  }

  wss.on("connection", (sock: WebSocket) => {
    const id = nextId();
    sockets.set(id, sock);
    sock.send(encode({ t: "welcome", id }));

    sock.on("message", (raw: Buffer) => {
      const msg = decode<ClientMessage>(raw.toString());
      if (!msg) return;
      if (msg.t === "join") {
        peers.set(id, { id, name: msg.name, color: msg.color, cursor: null });
        broadcast({ t: "presence", peers: [...peers.values()] });
      } else if (msg.t === "move") {
        const p = peers.get(id);
        if (p) { p.cursor = msg.cursor; broadcast({ t: "moved", id, cursor: msg.cursor }, id); }
      } else if (msg.t === "leave") {
        cleanup();
      }
    });

    function cleanup() {
      if (!sockets.has(id)) return;
      sockets.delete(id);
      peers.delete(id);
      broadcast({ t: "left", id });
    }
    sock.on("close", cleanup);
  });

  return {
    wss, peers,
    close: () => new Promise((res) => wss.close(() => res())),
  };
}
