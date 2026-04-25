const MAINTENANCE_BYPASS_HEADER = "X-SavePoint-Maintenance-Bypass";

export function installMaintenanceBypassFetch() {
  const token = process.env.AUDIT_MAINTENANCE_BYPASS_TOKEN?.trim() || process.env.MAINTENANCE_BYPASS_TOKEN?.trim();

  if (!token) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set(MAINTENANCE_BYPASS_HEADER, token);

    return originalFetch(input, {
      ...init,
      headers
    });
  }) as typeof fetch;
}
