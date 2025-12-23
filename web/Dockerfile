FROM node:20-alpine AS build

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/.next /app/.next
COPY --from=build /app/public /app/public
COPY --from=build /app/next.config.ts /app/next.config.ts

EXPOSE 3000

CMD ["npm", "start"]
