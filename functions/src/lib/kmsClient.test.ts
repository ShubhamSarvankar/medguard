import { describe, it, expect } from "vitest";
import { wrapDataKey, unwrapDataKey, createUserKey } from "../lib/kmsClient";

describe("kmsClient", () => {
  const uid = "user-test-123";
  const dataKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));

  it("wrap then unwrap roundtrip returns the original key", async () => {
    const wrapped = await wrapDataKey(uid, dataKey);
    const unwrapped = await unwrapDataKey(uid, wrapped);
    expect(unwrapped).toEqual(dataKey);
  });

  it("wrapped key differs from plaintext key", async () => {
    const wrapped = await wrapDataKey(uid, dataKey);
    expect(wrapped).not.toEqual(dataKey);
  });

  it("unwrap with wrong uid throws an error", async () => {
    const wrapped = await wrapDataKey(uid, dataKey);
    await expect(unwrapDataKey("wrong-uid", wrapped)).rejects.toThrow();
  });

  it("two wraps of the same key produce the same wrapped output (deterministic KEK)", async () => {
    const wrapped1 = await wrapDataKey(uid, dataKey);
    const wrapped2 = await wrapDataKey(uid, dataKey);
    expect(wrapped1).toEqual(wrapped2);
  });

  it("different uids produce different wrapped keys", async () => {
    const wrapped1 = await wrapDataKey("uid-a", dataKey);
    const wrapped2 = await wrapDataKey("uid-b", dataKey);
    expect(wrapped1).not.toEqual(wrapped2);
  });

  it("createUserKey resolves without throwing", async () => {
    await expect(createUserKey(uid)).resolves.toBeUndefined();
  });
});