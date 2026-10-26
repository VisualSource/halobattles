import type { Client, Session } from "@heroiclabs/nakama-js";

const DEVICE_ID_KEY = "halobattles.deviceId";

/** Silent device auth. The device id is generated once and kept in storage. */
export async function signIn(client: Client, storage: Storage) {
  let deviceId = storage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    storage.setItem(DEVICE_ID_KEY, deviceId);
  }
  const session = await client.authenticateDevice(deviceId, true);
  const account = await client.getAccount(session);
  return { session, needsDisplayName: !account.user?.display_name };
}

export async function setDisplayName(
  client: Client,
  session: Session,
  displayName: string,
) {
  await client.updateAccount(session, { display_name: displayName });
}
