const DYNAMIC_IMPORT_FAILURE_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /loading chunk\s+\S+\s+failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
] as const;

const errorMessage = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; reason?: unknown };
    if (typeof candidate.message === 'string') return candidate.message;
    if (candidate.reason !== undefined) return errorMessage(candidate.reason);
  }
  return '';
};

export const isStaleDynamicImportError = (value: unknown): boolean => {
  const message = errorMessage(value);
  return Boolean(message) && DYNAMIC_IMPORT_FAILURE_PATTERNS.some(pattern => pattern.test(message));
};

export const buildChunkRecoveryUrl = (
  currentHref: string,
  basePath: string,
  targetBuildId: string,
): string => {
  const target = new URL(basePath || './', currentHref);
  target.searchParams.set('__aetheros_release', targetBuildId);
  return target.toString();
};
