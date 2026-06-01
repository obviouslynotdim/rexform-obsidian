# Stage 1: grab the oathkeeper binary from the official image
FROM oryd/oathkeeper:v0.40.6 AS oathkeeper-bin

# Stage 2: Alpine runtime with envsubst for env-var injection into both config files
FROM alpine:3.19

RUN apk add --no-cache ca-certificates gettext

# Copy the oathkeeper binary
COPY --from=oathkeeper-bin /usr/bin/oathkeeper /usr/bin/oathkeeper

# Both files are templates — envsubst runs on them at container startup so
# ${KRATOS_PUBLIC_URL}, ${NEXTJS_URL}, ${OATHKEEPER_PUBLIC_URL}, and
# ${COUCHDB_ADMIN_URL} are injected from Railway env vars, never baked in.
COPY oathkeeper.yml /tmp/oathkeeper.template.yml
COPY access-rules.yml /tmp/access-rules.template.yml

EXPOSE 4455 4456

CMD ["sh", "-c", \
  "mkdir -p /etc/config/oathkeeper && \
   envsubst < /tmp/oathkeeper.template.yml > /etc/config/oathkeeper/oathkeeper.yml && \
   envsubst < /tmp/access-rules.template.yml > /etc/config/oathkeeper/access-rules.yml && \
   exec oathkeeper serve --config /etc/config/oathkeeper/oathkeeper.yml"]
