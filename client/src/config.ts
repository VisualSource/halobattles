import { Client } from "@heroiclabs/nakama-js";
import { WebSocketAdapterPb } from "@heroiclabs/nakama-js-protobuf";

// The only place that knows where the server lives. Clients talk to Nakama
// directly on :7350, with no proxy. Defaults to the host that served the page,
// so another machine on the LAN reaches the same Nakama. VITE_NAKAMA_SAME_ORIGIN
// sends it through the page's own origin instead, for a tunnel where the dev
// server proxies Nakama (see vite.config.ts).
const sameOrigin = import.meta.env.VITE_NAKAMA_SAME_ORIGIN === "true";
const https = location.protocol === "https:";
const host = import.meta.env.VITE_NAKAMA_HOST ?? location.hostname;
const port = sameOrigin
  ? location.port || (https ? "443" : "80")
  : (import.meta.env.VITE_NAKAMA_PORT ?? "7350");
const useSSL = sameOrigin ? https : import.meta.env.VITE_NAKAMA_SSL === "true";
const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey"; // dev only

export const client = new Client(serverKey, host, port, useSSL);

/** A socket using the protobuf adapter, so FlatBuffers bytes travel raw. */
export const createSocket = () =>
  client.createSocket(useSSL, false, new WebSocketAdapterPb());
