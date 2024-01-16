FROM node:21-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base as build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run -r build
RUN pnpm deploy --filter=halobattles-server --prod /prod/server

FROM base 
# copy backend
COPY --from=build  /prod/server/node_modules ./node_modules
COPY --from=build  /prod/server/package.json ./
COPY --from=build  /app/server/dist ./dist
# copy frontend
COPY --from=build /app/client/dist ./public

EXPOSE 8000

CMD [ "pnpm", "start" ]