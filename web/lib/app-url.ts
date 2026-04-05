function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getPublicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return stripTrailingSlash(configured);
  }

  return "http://localhost:3000";
}

export function buildPublicUrl(path: string) {
  const baseUrl = getPublicAppUrl();
  return path.startsWith("/") ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}
