# Build your own image: docker build -t fenxi .
# The default `npm run build` stays on the Vercel target. SEAT_IMAGE switches
# this image to a Node server you can run without that platform.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV SEAT_IMAGE=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080
ENV PGLITE_DATA_DIR=/data
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules/@electric-sql/pglite/dist/pglite.data \
  /app/node_modules/@electric-sql/pglite/dist/pglite.wasm \
  /app/node_modules/@electric-sql/pglite/dist/initdb.wasm \
  ./.output/server/_libs/
COPY scripts/container-start.sh /usr/local/bin/container-start.sh
RUN chmod +x /usr/local/bin/container-start.sh
EXPOSE 8080
VOLUME ["/data"]
CMD ["container-start.sh"]
