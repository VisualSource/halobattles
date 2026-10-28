# The halobattles server for a Pterodactyl egg: Nakama with the game's plugin
# and the base Mod baked in. Build from the repo root:
#   podman build -f deploy/pterodactyl/Dockerfile -t halobattles .
# See deploy/pterodactyl/README.md.

# The plugin must be built by the pluginbuilder matching the Nakama image
# exactly: same Go, same nakama-common. Bump both tags together.
FROM docker.io/heroiclabs/nakama-pluginbuilder:3.41.0 AS plugin
WORKDIR /builder
COPY server/ .
RUN go mod vendor && go build -buildmode=plugin -trimpath -mod=vendor -o /out/halobattles.so .

FROM docker.io/heroiclabs/nakama:3.41.0
# Outside /home/container: Wings mounts the server's volume over it.
COPY --from=plugin /out/halobattles.so /nakama/modules/halobattles.so
COPY mods/ /nakama/mods/
COPY deploy/pterodactyl/entrypoint.sh /entrypoint.sh
# a+rX: Wings runs the container as its own uid, not this user.
RUN chmod -R a+rX /nakama /entrypoint.sh \
 && useradd -m -d /home/container container
USER container
# Mods are found on HALO_MODS_DIR in order: the image's first, then any the
# server's owner uploads to mods/, so adding a Mod needs no rebuild.
ENV USER=container HOME=/home/container HALO_MODS=base HALO_MODS_DIR=/nakama/mods:/home/container/mods
WORKDIR /home/container
ENTRYPOINT ["tini", "--", "/bin/bash", "/entrypoint.sh"]
