import { describe, it, expect } from "vitest";
import { encode, decode, applyServerMessage, nextId, Peer } from "./protocol";

const peer = (id: string, x = 0, y = 0): Peer => ({ id, name: id, color: "#f00", cursor: { x, y } });

describe("encode/decode", () => {
  it("round-trips a message", () => {
    const msg = { t: "move", cursor: { x: 1, y: 2 } } as const;
    expect(decode(encode(msg))).toEqual(msg);
  });
  it("returns null on bad input", () => {
    expect(decode("{not json")).toBeNull();
  });
});

describe("applyServerMessage", () => {
  it("presence replaces the whole snapshot", () => {
    const next = applyServerMessage({}, { t: "presence", peers: [peer("a"), peer("b")] });
    expect(Object.keys(next).sort()).toEqual(["a", "b"]);
  });
  it("moved updates only a known peer's cursor", () => {
    const start = { a: peer("a", 0, 0) };
    const next = applyServerMessage(start, { t: "moved", id: "a", cursor: { x: 9, y: 9 } });
    expect(next.a.cursor).toEqual({ x: 9, y: 9 });
    // unknown peer is ignored
    expect(applyServerMessage(start, { t: "moved", id: "z", cursor: { x: 1, y: 1 } })).toBe(start);
  });
  it("left removes a peer immutably", () => {
    const start = { a: peer("a"), b: peer("b") };
    const next = applyServerMessage(start, { t: "left", id: "a" });
    expect(Object.keys(next)).toEqual(["b"]);
    expect(start.a).toBeDefined(); // original untouched
  });
});

describe("nextId", () => {
  it("is unique", () => {
    expect(nextId()).not.toBe(nextId());
  });
});
