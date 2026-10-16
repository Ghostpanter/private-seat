#!/bin/sh
set -eu
export DISPLAY=:99
mkdir -p /profile
Xvfb :99 -screen 0 1280x900x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
sleep 0.5
x11vnc -display :99 -forever -shared -rfbport 5900 -localhost \
  -passwd "${VNC_PASSWORD:-seat-browser}" >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc 0.0.0.0:6080 127.0.0.1:5900 >/tmp/novnc.log 2>&1 &
chromium \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --user-data-dir=/profile \
  --remote-debugging-port=9223 \
  --remote-allow-origins=* \
  --window-size=1280,900 \
  --no-first-run \
  --no-default-browser-check \
  https://grok.com >/tmp/chromium.log 2>&1 &
sleep 1
exec socat TCP-LISTEN:9222,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9223
