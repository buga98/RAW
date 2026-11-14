# PRIVATE PILOT — do not expose port 7788 directly to the Internet.
FROM node:22.16.0-alpine
WORKDIR /srv/raw
RUN printf '{"name":"raw-private-relay","private":true,"type":"module","dependencies":{"ws":"8.18.3"}}\n' > package.json \
 && npm install --omit=dev --no-audit --no-fund
COPY raw-v548-relay-gateway.mjs ./raw-v548-relay-gateway.mjs
USER node
EXPOSE 7788
CMD ["node","raw-v548-relay-gateway.mjs"]
