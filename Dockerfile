# Build stage: install everything, build the web app into apps/api/public, then drop the dev dependencies.
# tsx is a runtime dependency (npm start runs the TypeScript API through it), so the prune keeps it.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.base.json tsconfig.json ./
RUN npm ci
RUN npm run build && npm prune --omit=dev

# Run stage: the API serves the built web app on $PORT (3001 unless the platform sets another).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build /app ./
EXPOSE 3001
CMD ["npm", "start"]
