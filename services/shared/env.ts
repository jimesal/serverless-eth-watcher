type NumberOptions = {
  integer?: boolean;
};

const WHITESPACE_ONLY = /^\s*$/;

export function requireEnv(name: string): string {
  const value = normalize(process.env[name]);
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, defaultValue = ""): string {
  const value = normalize(process.env[name]);
  return value ?? defaultValue;
}

export function requireNumberEnv(name: string, options?: NumberOptions): number {
  const raw = normalize(process.env[name]);
  if (raw === undefined) {
    throw new Error(`Missing required numeric environment variable ${name}`);
  }
  return coerceNumber(name, raw, options);
}

export function optionalNumberEnv(
  name: string,
  defaultValue: number,
  options?: NumberOptions,
): number {
  const raw = normalize(process.env[name]);
  if (raw === undefined) return defaultValue;
  return coerceNumber(name, raw, options);
}

export function parseWalletList(raw?: string): string[] | undefined {
  if (!raw || WHITESPACE_ONLY.test(raw)) return undefined;
  const seen = new Set<string>();
  const wallets = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
  return wallets.length ? wallets : undefined;
}

export function frozenWalletList(
  raw: string | undefined,
  fallback: readonly string[] = [],
): readonly string[] {
  const parsed = parseWalletList(raw);
  return Object.freeze([...(parsed ?? fallback)]);
}

function coerceNumber(name: string, raw: string, options?: NumberOptions): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be a finite number`);
  }
  if (options?.integer && !Number.isInteger(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return value;
}

function normalize(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
