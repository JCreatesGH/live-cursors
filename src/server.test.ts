import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "./server";
import { encode, decode, ServerMessage } from "./protocol";

let stop: (() => Promise<void>) | null = null;
afterEach(async () => { if (stop) await stop(); stop = null; });

function waitFor(ws: WebSocket, pred: (m: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve) => {
    ws.on("message", (raw) => {
      const m = decode<ServerMessage>(raw.toString());
      if (m && pred(m)) resolve(m);
    });
  });
}

describe("presence server (integration)", () => {
  it("broadcasts presence and cursor moves between two clients", async () => {
    const port = 9100 + Math.floor(Math.random() * 500);
    const srv = createServer({ port });
    stop = srv.close;

    const a = new WebSocket(`ws://localhost:${port}`);
    await new Promise((r) => a.on("open", r));
    a.send(encode({ t: "join", name: "Ann", color: "#f00" }));

    const b = new WebSocket(`ws://localhost:${port}`);
    await new Promise((r) => b.on("open", r));

    // B should receive a presence snapshot once it joins
    const presenceP = waitFor(b, (m) => m.t === "presence");
    b.send(encode({ t: "join", name: "Bob", color: "#00f" }));
    const presence: any = await presenceP;
    expect(presence.peers.length).toBe(2);

    // A moves; B should be told
    const movedP = waitFor(b, (m) => m.t === "moved");
    a.send(encode({ t: "move", cursor: { x: 42, y: 7 } }));
    const moved: any = await movedP;
    expect(moved.cursor).toEqual({ x: 42, y: 7 });

    // A leaves; B should be told
    const leftP = waitFor(b, (m) => m.t === "left");
    a.close();
    await leftP;
    expect(srv.peers.size).toBe(1);

    b.close();
  });

  it("isolates presence and moves by room", async () => {
    const port = 9700 + Math.floor(Math.random() * 200);
    const srv = createServer({ port });
    stop = srv.close;

    const a = new WebSocket(`ws://localhost:${port}`);
    await new Promise((r) => a.on("open", r));
    const aPresence = waitFor(a, (m) => m.t === "presence");
    a.send(encode({ t: "join", name: "Ann", color: "#f00", room: "room-1" }));
    expect(((await aPresence) as any).peers.length).toBe(1);   // only A in room-1

    // B joins a different room; A must NOT receive a presence update
    let aGotUpdate = false;
    a.on("message", (raw) => { const m = decode<ServerMessage>(raw.toString()); if (m && m.t !== "welcome") aGotUpdate = true; });
    const b = new WebSocket(`ws://localhost:${port}`);
    await new Promise((r) => b.on("open", r));
    const bPresence = waitFor(b, (m) => m.t === "presence");
    b.send(encode({ t: "join", name: "Bob", color: "#00f", room: "room-2" }));
    expect(((await bPresence) as any).peers.length).toBe(1);   // only B in room-2

    a.send(encode({ t: "move", cursor: { x: 5, y: 5 } }));
    await new Promise((r) => setTimeout(r, 60));
    expect(aGotUpdate).toBe(false);                            // cross-room silence

    a.close(); b.close();
  });

  it("sends heartbeat pings to connected clients", async () => {
    const port = 9300 + Math.floor(Math.random() * 200);
    const srv = createServer({ port, heartbeatMs: 25 });
    stop = srv.close;

    const a = new WebSocket(`ws://localhost:${port}`);
    await new Promise((r) => a.on("open", r));
    await new Promise<void>((resolve) => a.on("ping", () => resolve()));   // resolves => heartbeat fired
    a.close();
  });
});
