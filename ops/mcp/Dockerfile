FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY integrations/mcp-server/package.json ./package.json
COPY integrations/mcp-server/src ./src
USER node
ENV MCP_PORT=8787
EXPOSE 8787
CMD ["node", "src/index.js"]
