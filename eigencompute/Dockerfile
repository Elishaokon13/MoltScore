FROM --platform=linux/amd64 node:18

USER root
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Expose HTTP port for the scoring API
EXPOSE 3001

ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
