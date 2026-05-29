FROM oryd/kratos:v1.2.0

COPY kratos.yml /etc/config/kratos/kratos.yml
COPY identity-schemas /etc/config/kratos/identity-schemas

EXPOSE 4433 4434

ENTRYPOINT ["kratos"]
CMD ["serve", "--config", "/etc/config/kratos/kratos.yml", "--dev", "--watch-courier"]
