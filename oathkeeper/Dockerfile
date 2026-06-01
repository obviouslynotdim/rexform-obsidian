# Stage 1: grab the oathkeeper binary from the official image
FROM oryd/oathkeeper:v0.40.6 AS oathkeeper-bin

# Stage 2: Alpine runtime with envsubst for env-var injection into access-rules.yml
FROM alpine:3.19

RUN apk add --no-cache ca-certificates gettext

# Copy the oathkeeper binary
COPY --from=oathkeeper-bin /usr/bin/oathkeeper /usr/bin/oathkeeper

# Static config — oathkeeper.yml supports native ${VAR} expansion at runtime
COPY oathkeeper.yml /etc/config/oathkeeper/oathkeeper.yml

# Access rules template — credentials are injected by envsubst at startup,
# so the password never lives in the image layer
COPY access-rules.yml /tmp/access-rules.template.yml

EXPOSE 4455 4456

# envsubst expands ${OATHKEEPER_PUBLIC_URL} and ${COUCHDB_ADMIN_URL} from
# Railway environment variables, then starts oathkeeper
CMD ["sh", "-c", \
  "envsubst < /tmp/access-rules.template.yml > /etc/config/oathkeeper/access-rules.yml && \
   exec oathkeeper serve --config /etc/config/oathkeeper/oathkeeper.yml"]
