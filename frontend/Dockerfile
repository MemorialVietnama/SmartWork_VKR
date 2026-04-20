# --- сборка Angular ---
FROM node:20-bookworm-slim AS build

WORKDIR /app
ENV NODE_OPTIONS=--max_old_space_size=4096
ENV NG_BUILD_MAX_WORKERS=2

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production --no-progress

# --- раздача статики ---
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
