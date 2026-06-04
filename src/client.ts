// Browser client: connects, streams local cursor (throttled), tracks peers.
import { Peer, ServerMessage, applyServerMessage, encode, decode } from "./protocol.js";

export interface ClientOptions {
  url: string;
  name: string;
  color: string;
  throttleMs?: number;
  onChange?: (peers: Peer[], selfId: string | null) => void;
  WebSocketImpl?: any;
}

export function connect(opts: ClientOptions) {
  const WS = opts.WebSocketImpl ?? (globalThis as any).WebSocket;
  const ws = new WS(opts.url);
  let peers: Record<string, Peer> = {};
  let selfId: string | null = null;
  let lastSent = 0;
  const throttle = opts.throttleMs ?? 40;

  const emit = () => opts.onChange?.(Object.values(peers), selfId);

  ws.onopen = () => ws.send(encode({ t: "join", name: opts.name, color: opts.color }));
  ws.onmessage = (ev: any) => {
    const msg = decode<ServerMessage>(typeof ev.data === "string" ? ev.data : ev.data.toString());
    if (!msg) return;
    if (msg.t === "welcome") { selfId = msg.id; return; }
    peers = applyServerMessage(peers, msg);
    emit();
  };

  function move(x: number, y: number) {
    const now = Date.now();
    if (now - lastSent < throttle) return;
    lastSent = now;
    if (ws.readyState === 1) ws.send(encode({ t: "move", cursor: { x, y } }));
  }

  function disconnect() {
    try { ws.send(encode({ t: "leave" })); } catch {}
    ws.close();
  }

  return { move, disconnect, get peers() { return Object.values(peers); }, get id() { return selfId; } };
}
