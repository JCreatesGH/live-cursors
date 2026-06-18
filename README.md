# live-cursors

[![CI](https://github.com/JCreatesGH/live-cursors/actions/workflows/ci.yml/badge.svg)](https://github.com/JCreatesGH/live-cursors/actions)
[![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

The "Figma multiplayer" demo as a tiny, reusable library: real-time cursors and presence over WebSockets. A transport-agnostic protocol + reducer, a small `ws` server, and a throttled browser client — all in a few hundred lines.

![screenshot](assets/screenshot.png)

## Run the demo

```bash
npm install
npm run build
npm start            # ws://localhost:8787
```

Serve `demo.html` and open it in two windows — you'll see each other's cursors move live.

## Use the client

```ts
import { connect } from "live-cursors";

const client = connect({
  url: "wss://your-host:8787",
  name: "Ada", color: "#f43f5e",
  onChange: (peers, selfId) => render(peers, selfId),
});

window.addEventListener("mousemove", (e) => client.move(e.clientX, e.clientY)); // throttled
```

## Use the server

```ts
import { createServer } from "live-cursors";
createServer({ port: 8787, heartbeatMs: 30000 });   // or { server } to attach to an http.Server
```

## Rooms

Pass a `room` on join to get independent presence spaces on one server — peers only see (and move alongside) others in the same room:

```ts
connect({ url, name, color, room: "doc-42", onChange });
```

Omit it and everyone shares the `"default"` room (backward compatible).

## Protocol

Client → server: `join` · `move` · `leave`.
Server → client: `welcome` · `presence` (full snapshot) · `moved` · `left`.

- **Validated input** — the server runs every client message through `validateClientMessage`, so a malformed `move` (non-numeric cursor) or a `join` with no name is dropped instead of being broadcast to peers. Names/colors/rooms are length-capped.
- **Heartbeat** — a ping/pong loop terminates connections that go silent (a dropped network would otherwise leave a ghost cursor until the TCP timeout) and broadcasts their `left`.
- **Pure reducer** — `applyServerMessage(peers, msg)` keeps client state in sync, so the tricky part is unit-tested with no sockets; integration tests spin up the real server and connect `ws` clients end-to-end (presence, moves, rooms, heartbeat).

## Development

```bash
npm test          # 14 tests (protocol reducer + validation + multi-room/heartbeat integration)
npm run build     # tsc, clean
```

## License

MIT
