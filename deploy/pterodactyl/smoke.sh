#!/usr/bin/env bash
# Runs the Pterodactyl image the way Wings does and checks it serves the
# game with the keys it was given: read-only root, an arbitrary uid, no
# capabilities, only /home/container and /tmp writable, a non-default port.
# Usage (from the repo root): bash deploy/pterodactyl/smoke.sh [image]
# Uses podman by default; set CONTAINER=docker for Docker.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: leave container paths alone

img=${1:-localhost/halobattles:dev}
c=${CONTAINER:-podman}
net=hb-smoke-net db=hb-smoke-db srv=hb-smoke vol=hb-smoke-home
port=8350
curl_img=docker.io/curlimages/curl:8.11.1

cleanup() {
	$c rm -f "$srv" "$db" >/dev/null 2>&1 || true
	$c volume rm -f "$vol" >/dev/null 2>&1 || true
	$c network rm -f "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

$c network create "$net" >/dev/null
$c run -d --name "$db" --network "$net" -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=nakama docker.io/library/postgres:16 >/dev/null
for _ in $(seq 60); do $c exec "$db" pg_isready -U postgres -d nakama >/dev/null 2>&1 && break; sleep 1; done

# Wings owns the server's volume with its own uid.
$c volume create "$vol" >/dev/null
$c run --rm --user 0 --entrypoint chown -v "$vol:/home/container" "$img" 988:988 /home/container

# A Mod uploaded to the server's mods/ folder, as an owner would over SFTP.
$c run --rm --user 988:988 --entrypoint sh -v "$vol:/home/container" "$img" -c '
	mkdir -p /home/container/mods/smoke-extra/data/resources
	echo "{\"name\": \"smoke-extra\", \"version\": \"1.0.0\", \"title\": \"Smoke\", \"dependencies\": [\"base >= 1.0\"]}" > /home/container/mods/smoke-extra/mod.jsonc
	echo "{\"id\": \"plasma-cells\", \"name\": \"Plasma cells\"}" > /home/container/mods/smoke-extra/data/resources/plasma-cells.jsonc
'

$c run -d --name "$srv" --network "$net" \
	--read-only --tmpfs /tmp --user 988:988 --cap-drop ALL --security-opt no-new-privileges \
	-v "$vol:/home/container" \
	-e SERVER_PORT=$port -e STARTUP=/nakama/nakama -e HALO_MODS=base,smoke-extra \
	-e DB_ADDRESS="postgres:smoke@$db:5432/nakama" \
	-e SERVER_KEY=smokekey -e SESSION_ENCRYPTION_KEY=smokesession -e SESSION_REFRESH_ENCRYPTION_KEY=smokerefresh \
	-e RUNTIME_HTTP_KEY=smokehttp -e CONSOLE_USERNAME=admin -e CONSOLE_PASSWORD='p@ss w$rd' -e CONSOLE_SIGNING_KEY=smokesign \
	"$img" >/dev/null

# Wings marks the server up on this line: the egg's "done".
for _ in $(seq 60); do $c logs "$srv" 2>&1 | grep -q 'Startup done' && break; sleep 1; done
$c logs "$srv" 2>&1 | grep -q 'Startup done' || { $c logs "$srv" | tail -20; echo "FAIL: no 'Startup done'"; exit 1; }

# From inside the network: a host's port forwarding isn't what's under test.
$c run --rm --network "$net" --entrypoint sh "$curl_img" -c '
	set -e
	u=http://'"$srv"':'"$port"'
	fail() { echo "FAIL: $1"; exit 1; }
	auth() { curl -s -o /dev/null -w "%{http_code}" -X POST "$u/v2/account/authenticate/device?create=true" \
		-u "$1": -H "Content-Type: application/json" -d "{\"id\":\"smoke-device-000001\"}"; }
	[ "$(auth smokekey)" = 200 ] || fail "the given server key was refused (is it on port '"$port"'?)"
	[ "$(auth defaultkey)" = 401 ] || fail "the stock defaultkey was accepted: the keys were dropped"
	tok=$(curl -s -X POST "$u/v2/account/authenticate/device?create=true" -u smokekey: \
		-H "Content-Type: application/json" -d "{\"id\":\"smoke-device-000001\"}" | sed -n "s/.*\"token\":\"\([^\"]*\)\".*/\1/p")
	curl -s -X POST "$u/v2/rpc/get_content" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -d "\"{}\"" \
		> /tmp/content
	grep -q "base:marine" /tmp/content || fail "get_content did not serve the base Mod"
	grep -q "smoke-extra:plasma-cells" /tmp/content || fail "get_content did not serve the Mod uploaded to mods/"
	console() { curl -s -o /dev/null -w "%{http_code}" -X POST http://'"$srv"':7351/v2/console/authenticate \
		-H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"$1\"}"; }
	[ "$(console "p@ss w\$rd")" = 200 ] || fail "the console refused its password"
	[ "$(console password)" = 401 ] || fail "the console took the stock password"
	echo "ok: port '"$port"', keys, content (a baked-in and an uploaded Mod) and console"
'

# Wings stops a server with ^C.
$c kill --signal INT "$srv" >/dev/null
code=$($c wait "$srv")
[ "$code" = 0 ] || { echo "FAIL: exit $code after SIGINT"; exit 1; }
echo "ok: clean shutdown on SIGINT"
