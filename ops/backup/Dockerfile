FROM alpine:3.22

RUN apk add --no-cache \
  bash \
  ca-certificates \
  coreutils \
  curl \
  dcron \
  git \
  jq \
  openssl \
  postgresql17-client \
  tar \
  tzdata \
  aws-cli

WORKDIR /app

COPY entrypoint.sh /usr/local/bin/backup-entrypoint.sh
COPY run-backup.sh /usr/local/bin/run-backup.sh
COPY restore-backup.sh /usr/local/bin/restore-backup.sh

RUN chmod +x /usr/local/bin/backup-entrypoint.sh /usr/local/bin/run-backup.sh /usr/local/bin/restore-backup.sh \
  && mkdir -p /backups /workspace /var/log

ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]
