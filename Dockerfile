FROM node:22-alpine

WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node data ./data

USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
