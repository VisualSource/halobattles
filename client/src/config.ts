import { Client } from "@heroiclabs/nakama-js";
import { WebSocketAdapterPb } from "@heroiclabs/nakama-js-protobuf";

// The only place that knows where the server lives. Clients talk to Nakama
// directly on :7350, with no proxy.
const host = import.meta.env.VITE_NAKAMA_HOST ?? "127.0.0.1";
const port = import.meta.env.VITE_NAKAMA_PORT ?? "7350";
const useSSL = import.meta.env.VITE_NAKAMA_SSL === "true";
const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey"; // dev only

export const client = new Client(serverKey, host, port, useSSL);

/** A socket using the protobuf adapter, so FlatBuffers bytes travel raw. */
export const createSocket = () =>
  client.createSocket(useSSL, false, new WebSocketAdapterPb());
