import type { Client } from "@heroiclabs/nakama-js";
import { describe, expect, it } from "vitest";
import { signIn } from "./auth";

function fakeNakama(displayName?: string) {
  const deviceIds: string[] = [];
  const client = {
    authenticateDevice: async (id: string) => {
      deviceIds.push(id);
      return { token: "t" };
    },
    getAccount: async () => ({ user: { display_name: displayName } }),
  } as unknown as Client;
  return { client, deviceIds };
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  } as Storage;
}

describe("signIn", () => {
  it("reuses the same device id on every sign-in", async () => {
    const { client, deviceIds } = fakeNakama("Chief");
    const storage = memoryStorage();

    await signIn(client, storage);
    await signIn(client, storage);

    expect(deviceIds).toHaveLength(2);
    expect(deviceIds[0]).toBe(deviceIds[1]);
    expect(deviceIds[0]?.length).toBeGreaterThanOrEqual(10);
  });

  it("asks for a display name only when the account has none", async () => {
    const fresh = await signIn(fakeNakama().client, memoryStorage());
    const named = await signIn(fakeNakama("Chief").client, memoryStorage());

    expect(fresh.needsDisplayName).toBe(true);
    expect(named.needsDisplayName).toBe(false);
  });
});
