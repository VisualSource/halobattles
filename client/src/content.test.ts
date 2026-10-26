import type { Client, Session } from "@heroiclabs/nakama-js";
import { describe, expect, it } from "vitest";
import { loadContent } from "./content";
import type { Content } from "./gen/content";

const rules = {
  id: "base:rules",
  name: "Rules",
  paydaySeconds: 90,
  cancelRefundPercent: 50,
  sellRefundPercent: 50,
  unitSlotsPerStack: 10,
  tiers: { average: 1 },
  laneTypes: { fast: 1 },
  initiativeDie: 20,
  roundSeconds: 3,
  roundCap: 40,
  startingResources: { "base:credits": 1000 },
  gracePeriodSeconds: 180,
  resultsSeconds: 60,
};

function doc(creditsName: string): Content {
  return {
    resources: { "base:credits": { id: "base:credits", name: creditsName } },
    rulesets: { "base:rules": rules },
  };
}

/** A server that holds `hash`/`content` and records what each call sent. */
function fakeServer(hash: string, content: Content) {
  const sent: object[] = [];
  const client = {
    rpc: async (_s: Session, id: string, input: { hash?: string }) => {
      expect(id).toBe("get_content");
      sent.push(input);
      return {
        payload: input.hash === hash ? { hash } : { hash, content },
      };
    },
  } as unknown as Client;
  return { client, sent };
}

/** Just enough of the Cache API, in memory. */
function memoryCaches(): CacheStorage {
  const store = new Map<string, Response>();
  // Browsers resolve relative keys against the page; Node needs a base.
  const url = (req: RequestInfo) =>
    typeof req === "string" ? new URL(req, "http://localhost").href : req.url;
  const cache = {
    keys: async () => [...store.keys()].map((u) => new Request(u)),
    match: async (req: RequestInfo) => store.get(url(req))?.clone(),
    put: async (req: RequestInfo, res: Response) =>
      void store.set(url(req), res),
    delete: async (req: RequestInfo) => store.delete(url(req)),
  };
  return { open: async () => cache } as unknown as CacheStorage;
}

const session = {} as Session;

describe("loadContent", () => {
  it("on a cache miss, fetches the document and caches it", async () => {
    const caches = memoryCaches();
    const { client, sent } = fakeServer("h1", doc("Credits"));

    const content = await loadContent(client, session, caches);

    expect(sent).toEqual([{}]);
    expect(content.resources.get("base:credits")?.name).toBe("Credits");
    expect(content.rules.paydaySeconds).toBe(90);
    expect(await (await caches.open("x")).keys()).toHaveLength(1);
  });

  it("on a cache hit, sends its hash and uses the cached document", async () => {
    const caches = memoryCaches();
    await loadContent(fakeServer("h1", doc("Credits")).client, session, caches);
    // Same hash, but this server would send different content if asked.
    const { client, sent } = fakeServer("h1", doc("Changed"));

    const content = await loadContent(client, session, caches);

    expect(sent).toEqual([{ hash: "h1" }]);
    expect(content.resources.get("base:credits")?.name).toBe("Credits");
  });

  it("without the Cache API, fetches the document every time", async () => {
    const { client, sent } = fakeServer("h1", doc("Credits"));

    await loadContent(client, session, undefined);
    const content = await loadContent(client, session, undefined);

    expect(sent).toEqual([{}, {}]);
    expect(content.resources.get("base:credits")?.name).toBe("Credits");
  });

  it("replaces a stale cached document when the hash changes", async () => {
    const caches = memoryCaches();
    await loadContent(fakeServer("h1", doc("Credits")).client, session, caches);

    const content = await loadContent(
      fakeServer("h2", doc("New")).client,
      session,
      caches,
    );

    expect(content.hash).toBe("h2");
    expect(content.resources.get("base:credits")?.name).toBe("New");
    expect(await (await caches.open("x")).keys()).toHaveLength(1);
  });
});
