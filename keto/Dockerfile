FROM oryd/keto:v0.11.1

COPY keto.yml /etc/config/keto/keto.yml

EXPOSE 4466 4467

CMD ["/bin/sh", "-c", "keto migrate up --config /etc/config/keto/keto.yml && keto serve --config /etc/config/keto/keto.yml"]
