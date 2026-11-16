FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node app.js index.html style.css icon.svg manifest.json notion-tables.json server.mjs ./
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
