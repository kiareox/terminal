FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    unzip \
    ca-certificates \
    proxychains4 \
    tini \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Xray-core (replacement for v2ray with xhttp, reality support)
RUN ARCH=$(dpkg --print-architecture) \
    && case "$ARCH" in \
        amd64) XRAY_ARCH="64" ;; \
        arm64) XRAY_ARCH="arm64-v8a" ;; \
        armhf) XRAY_ARCH="arm32-v7a" ;; \
        *)     XRAY_ARCH="64" ;; \
    esac \
    && (curl -fsSL "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${XRAY_ARCH}.zip" -o /tmp/xray.zip \
        || curl -fsSL "https://github.com/XTLS/Xray-core/releases/download/v26.3.27/Xray-linux-${XRAY_ARCH}.zip" -o /tmp/xray.zip) \
    && unzip -q /tmp/xray.zip -d /tmp/xray \
    && mv /tmp/xray/xray /usr/local/bin/xray \
    && chmod +x /usr/local/bin/xray \
    && ln -sf /usr/local/bin/xray /usr/local/bin/v2ray \
    && rm -rf /tmp/xray /tmp/xray.zip

# Copy Node dependency definitions and install
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Install Python requirements (root requirements.txt & telegram bot requirements)
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt || pip3 install --no-cache-dir -r requirements.txt
RUN if [ -f "telegram_bot/requirements.txt" ]; then pip3 install --no-cache-dir --break-system-packages -r "telegram_bot/requirements.txt" || pip3 install --no-cache-dir -r "telegram_bot/requirements.txt"; fi

# Copy proxychains configuration
RUN if [ -f "telegram_bot/proxychains.conf" ]; then \
      cp "telegram_bot/proxychains.conf" /etc/proxychains4.conf && \
      cp "telegram_bot/proxychains.conf" /etc/proxychains.conf; \
    elif [ -f "proxychains.conf" ]; then \
      cp proxychains.conf /etc/proxychains4.conf && \
      cp proxychains.conf /etc/proxychains.conf; \
    fi

RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
