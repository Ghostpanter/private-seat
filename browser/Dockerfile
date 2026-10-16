FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    socat \
    ca-certificates \
    fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 6080 9222
VOLUME ["/profile"]
CMD ["/start.sh"]
