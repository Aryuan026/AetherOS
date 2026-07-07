const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '');

export const publicAsset = (path: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${trimLeadingSlash(path)}`;
};

export const normalizePublicAssetUrl = (value: string | undefined | null): string => {
  if (!value) return '';
  if (value.startsWith('/assets/')) return publicAsset(value);
  return value;
};
