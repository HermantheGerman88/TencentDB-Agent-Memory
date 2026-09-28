/**
 * Enum coercion helpers that warn loudly when an invalid value is encountered,
 * instead of silently falling back to a default.
 *
 * Used by config.ts, gateway/config.ts and gateway/server.ts to guard
 * storeBackend, deployMode, stateBackend and STORE_MODE.
 */

import type { Logger } from "../core/types.js";

export type WarnLogger = Pick<Logger, "warn">;

const DEFAULT_LOGGER: WarnLogger = {
  warn: (message: string) => {
    // eslint-disable-next-line no-console
    console.warn(message);
  },
};

export interface CoerceOpts<T extends string> {
  /** Env var or config key name, e.g. "STORE_MODE". */
  source: string;
  value: string | undefined | null;
  allowed: readonly T[];
  fallback: T;
  logger?: WarnLogger;
}

export function coerceEnum<T extends string>(o: CoerceOpts<T>): T {
  const raw = o.value;
  if (raw === undefined || raw === null || raw.trim() === "") {
    return o.fallback;
  }
  if ((o.allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  const log = o.logger ?? DEFAULT_LOGGER;
  log.warn(
    `[CONFIG] ${o.source}="${raw}" is not a valid value (accepted: ${o.allowed.join(" | ")}). ` +
      `Falling back to "${o.fallback}". Set ${o.source} to one of the accepted values to silence this warning.`,
  );
  return o.fallback;
}

export interface CoerceOrUndefinedOpts<T extends string> {
  source: string;
  value: string | undefined | null;
  allowed: readonly T[];
  logger?: WarnLogger;
}

export function coerceEnumOrUndefined<T extends string>(
  o: CoerceOrUndefinedOpts<T>,
): T | undefined {
  const raw = o.value;
  if (raw === undefined || raw === null || raw.trim() === "") {
    return undefined;
  }
  if ((o.allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  const log = o.logger ?? DEFAULT_LOGGER;
  log.warn(
    `[CONFIG] ${o.source}="${raw}" is not a valid value (accepted: ${o.allowed.join(" | ")}). ` +
      `Ignoring ${o.source} and using the auto-derived default.`,
  );
  return undefined;
}

// ── Store-mode convenience wrapper ──────────────────────────────────────────

export type StoreMode = "sqlite" | "tcvdb";
export const STORE_MODES: readonly StoreMode[] = ["sqlite", "tcvdb"];

export function resolveStoreMode(
  raw: string | undefined,
  deployMode: "standalone" | "service",
  logger?: WarnLogger,
): StoreMode {
  return coerceEnum({
    source: "STORE_MODE",
    value: raw,
    allowed: STORE_MODES,
    fallback: deployMode === "service" ? "tcvdb" : "sqlite",
    logger,
  });
}
