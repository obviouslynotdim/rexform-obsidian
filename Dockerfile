FROM ghcr.io/sytone/obsidian-remote:latest

USER root
RUN echo "nameserver 8.8.8.8" > /etc/resolv.conf && \
    echo "nameserver 1.1.1.1" >> /etc/resolv.conf

USER abc