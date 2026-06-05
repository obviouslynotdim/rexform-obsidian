FROM oryd/keto:v0.11.1

COPY keto.yml /etc/config/keto/keto.yml

EXPOSE 4466 4467

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["export DSN=\"postgres://${KETO_DB_USER}:${KETO_DB_PASSWORD}@kratos-postgres.railway.internal:5432/${KETO_DB_NAME}\" && keto migrate up --config /etc/config/keto/keto.yml && keto serve --config /etc/config/keto/keto.yml"]
