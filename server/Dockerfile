FROM debian:stable-slim

ARG VERSION=latest

RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Fetch prebuilt excalidraw-complete binary. Pin a version via build arg VERSION.
ADD https://github.com/PatWie/excalidraw-complete/releases/download/${VERSION}/excalidraw-complete /usr/local/bin/excalidraw-complete
RUN chmod +x /usr/local/bin/excalidraw-complete

ENV STORAGE_TYPE=filesystem \
    STORAGE_PATH=/data \
    PORT=3000

EXPOSE 3000
VOLUME ["/data"]

CMD ["/usr/local/bin/excalidraw-complete"]


