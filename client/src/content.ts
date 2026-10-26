import type { Client, Session } from "@heroiclabs/nakama-js";
import type { Content, Resource, Ruleset } from "./gen/content";

const CACHE_NAME = "halobattles-content";
const keyFor = (hash: string) => `/content/${hash}`;

export type ContentLookups = {
  hash: string;
  resources: Map<string, Resource>;
  rules: Ruleset;
};

/**
 * Fetches the merged content once per server hash. The Cache API holds at
 * most one document, keyed by its hash, which is sent so an unchanged server
 * replies with the hash alone. Without the Cache API (it needs a secure
 * context, so plain http on a LAN has none) it fetches every time.
 */
export async function loadContent(
  client: Client,
  session: Session,
  caches: CacheStorage | undefined,
): Promise<ContentLookups> {
  const cache = await caches?.open(CACHE_NAME);
  const cachedKey = (await cache?.keys())?.[0];
  const cachedHash = cachedKey?.url.split("/").pop();

  const res = await client.rpc(
    session,
    "get_content",
    cachedHash ? { hash: cachedHash } : {},
  );
  const reply = res.payload as { hash: string; content?: Content };

  let doc: Content;
  if (reply.content) {
    doc = reply.content;
    await cache?.put(keyFor(reply.hash), Response.json(doc));
    if (cachedKey) await cache?.delete(cachedKey);
  } else {
    const cached = cachedKey && (await cache?.match(cachedKey));
    if (!cached) throw new Error("content cache vanished mid-load");
    doc = await cached.json();
  }

  const rules = doc.rulesets["base:rules"];
  if (!rules) throw new Error("content has no base:rules");
  return {
    hash: reply.hash,
    resources: new Map(Object.entries(doc.resources)),
    rules,
  };
}
