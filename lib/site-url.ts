import { headers } from 'next/headers';

function cleanBaseUrl(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const withProtocol = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return null;
  }
}

export function getConfiguredSiteOrigin(): string | null {
  return cleanBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? cleanBaseUrl(process.env.VERCEL_URL);
}

export function getRequestOrigin(): string | null {
  const h = headers();
  return (
    cleanBaseUrl(h.get('origin')) ??
    cleanBaseUrl(
      h.get('host')
        ? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`
        : null,
    )
  );
}

export function getAppOrigin(): string {
  return getConfiguredSiteOrigin() ?? getRequestOrigin() ?? 'http://localhost:3000';
}

export function buildAppUrl(path: string): string {
  return new URL(path, `${getAppOrigin()}/`).toString();
}
