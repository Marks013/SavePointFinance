const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";

const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const serverDsn = process.env.SENTRY_DSN ?? clientDsn;

export function getClientSentryOptions() {
  return {
    dsn: clientDsn,
    enabled: Boolean(clientDsn),
    environment,
    sendDefaultPii: false
  };
}

export function getServerSentryOptions() {
  return {
    dsn: serverDsn,
    enabled: Boolean(serverDsn),
    environment,
    sendDefaultPii: false
  };
}
