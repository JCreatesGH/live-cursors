import { describe, it, expect } from "vitest";
import { encode, decode, applyServerMessage, nextId, validateClientMessage, Peer } from "./protocol";

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

describe("validateClientMessage", () => {
  it("accepts a well-formed join (with optional room)", () => {
    expect(validateClientMessage({ t: "join", name: "Ada", color: "#f00" }))
      .toEqual({ t: "join", name: "Ada", color: "#f00" });
    expect(validateClientMessage({ t: "join", name: "Ada", color: "#f00", room: "team-1" }))
      .toEqual({ t: "join", name: "Ada", color: "#f00", room: "team-1" });
  });
  it("accepts a numeric move and a leave", () => {
    expect(validateClientMessage({ t: "move", cursor: { x: 3, y: 4 } }))
      .toEqual({ t: "move", cursor: { x: 3, y: 4 } });
    expect(validateClientMessage({ t: "leave" })).toEqual({ t: "leave" });
  });
  it("rejects a move with a non-numeric or infinite cursor", () => {
    expect(validateClientMessage({ t: "move", cursor: { x: "9", y: 1 } })).toBeNull();
    expect(validateClientMessage({ t: "move", cursor: { x: Infinity, y: 1 } })).toBeNull();
    expect(validateClientMessage({ t: "move" })).toBeNull();
  });
  it("rejects a join with no name, unknown types, and non-objects", () => {
    expect(validateClientMessage({ t: "join", color: "#f00" })).toBeNull();
    expect(validateClientMessage({ t: "explode" })).toBeNull();
    expect(validateClientMessage("nope")).toBeNull();
    expect(validateClientMessage(null)).toBeNull();
  });
  it("truncates an over-long name", () => {
    const m = validateClientMessage({ t: "join", name: "x".repeat(500), color: "#f00" }) as any;
    expect(m.name.length).toBe(64);
  });
});
