#!/bin/bash
# Starts the halobattles server the way Wings runs this image: as an
# arbitrary uid, with only /home/container (the server's files) and /tmp
# writable, listening on the primary allocation's port.
#
# The egg's startup line is only shown in the panel. This script builds
# Nakama's command from the egg's variables itself, so keys never go through
# a shell eval or into the console log.
set -euo pipefail
cd /home/container

need() {
	for v in "$@"; do
		if [[ -z "${!v:-}" ]]; then
			echo "halobattles: ${v} isn't set; set it in the server's Startup variables" >&2
			exit 1
		fi
	done
}
need SERVER_PORT DB_ADDRESS SERVER_KEY SESSION_ENCRYPTION_KEY SESSION_REFRESH_ENCRYPTION_KEY \
	RUNTIME_HTTP_KEY CONSOLE_USERNAME CONSOLE_PASSWORD CONSOLE_SIGNING_KEY HALO_MODS HALO_MODS_DIR

args=(
	--name halobattles
	--database.address "${DB_ADDRESS}"
	--data_dir /home/container/data
	--runtime.path /nakama/modules
	# A bool takes =value: "--logger.stdout true" would end flag parsing at
	# "true" and silently drop every flag after it, keys included.
	--logger.stdout=true
	--logger.level "${LOG_LEVEL:-INFO}"
	--socket.port "${SERVER_PORT}"
	--socket.server_key "${SERVER_KEY}"
	--session.encryption_key "${SESSION_ENCRYPTION_KEY}"
	--session.refresh_encryption_key "${SESSION_REFRESH_ENCRYPTION_KEY}"
	--runtime.http_key "${RUNTIME_HTTP_KEY}"
	--console.username "${CONSOLE_USERNAME}"
	--console.password "${CONSOLE_PASSWORD}"
	--console.signing_key "${CONSOLE_SIGNING_KEY}"
	# Refresh the open list's label index every tick, so a lobby someone just
	# left doesn't linger in the menu.
	--match.label_update_interval_ms 200
)
# Without its own allocation the console stays private to the container.
if [[ -n "${CONSOLE_PORT:-}" ]]; then
	args+=(--console.port "${CONSOLE_PORT}")
fi

echo "halobattles: migrating the database"
/nakama/nakama migrate up --database.address "${DB_ADDRESS}"
echo "halobattles: starting on port ${SERVER_PORT} with Mods ${HALO_MODS}"
exec /nakama/nakama "${args[@]}"
