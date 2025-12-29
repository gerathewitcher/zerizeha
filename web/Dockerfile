FROM node:20-alpine AS build

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_STUN_URLS
ARG NEXT_PUBLIC_TURN_URLS
ARG NEXT_PUBLIC_TURN_USERNAME
ARG NEXT_PUBLIC_TURN_CREDENTIAL

ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
ENV NEXT_PUBLIC_STUN_URLS=${NEXT_PUBLIC_STUN_URLS}
ENV NEXT_PUBLIC_TURN_URLS=${NEXT_PUBLIC_TURN_URLS}
ENV NEXT_PUBLIC_TURN_USERNAME=${NEXT_PUBLIC_TURN_USERNAME}
ENV NEXT_PUBLIC_TURN_CREDENTIAL=${NEXT_PUBLIC_TURN_CREDENTIAL}

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY --from=build /app/.next /app/.next
COPY --from=build /app/public /app/public
COPY --from=build /app/next.config.ts /app/next.config.ts

EXPOSE 3000

CMD ["npm", "start"]
