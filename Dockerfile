FROM lscr.io/linuxserver/obsidian:latest

RUN printf '#!/bin/bash\necho "nameserver 8.8.8.8" > /etc/resolv.conf\necho "nameserver 1.1.1.1" >> /etc/resolv.conf\n' \
    > /etc/cont-init.d/01-dns.sh && \
    chmod +x /etc/cont-init.d/01-dns.sh
