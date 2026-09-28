import { describe, it, expect, vi } from "vitest";
import {
  coerceEnum,
  coerceEnumOrUndefined,
  resolveStoreMode,
  STORE_MODES,
  type WarnLogger,
} from "./enum-guard.js";

/** Build a logger that records warnings so we can assert on them. */
function recordingLogger(): { logger: WarnLogger; warns: string[] } {
  const warns: string[] = [];
  const logger: WarnLogger = { warn: (m: string) => warns.push(m) };
  return { logger, warns };
}

describe("coerceEnum", () => {
  it("returns the fallback when the value is unset", () => {
    const { logger, warns } = recordingLogger();
    const result = coerceEnum({
      source: "STORE_MODE",
      value: undefined,
      allowed: STORE_MODES,
      fallback: "sqlite",
      logger,
    });
    expect(result).toBe("sqlite");
    expect(warns).toHaveLength(0);
  });

  it("returns the fallback when the value is an empty string", () => {
    const { logger, warns } = recordingLogger();
    const result = coerceEnum({
      source: "STORE_MODE",
      value: "   ",
      allowed: STORE_MODES,
      fallback: "sqlite",
      logger,
    });
    expect(result).toBe("sqlite");
    expect(warns).toHaveLength(0);
  });

  it("returns the value unchanged when it is valid", () => {
    const { logger, warns } = recordingLogger();
    const result = coerceEnum({
      source: "STORE_MODE",
      value: "tcvdb",
      allowed: STORE_MODES,
      fallback: "sqlite",
      logger,
    });
    expect(result).toBe("tcvdb");
    expect(warns).toHaveLength(0);
  });

  it("warns and falls back when the value is invalid", () => {
    const { logger, warns } = recordingLogger();
    const result = coerceEnum({
      source: "STORE_MODE",
      value: "mongodb",
      allowed: STORE_MODES,
      fallback: "sqlite",
      logger,
    });
    expect(result).toBe("sqlite");
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('STORE_MODE="mongodb"');
    expect(warns[0]).toContain("not a valid value");
    expect(warns[0]).toContain("sqlite | tcvdb");
  });

  it("falls back to the default logger (console.warn) when none is supplied", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = coerceEnum({
        source: "X",
        value: "bad",
        allowed: ["a", "b"] as const,
        fallback: "a",
      });
      expect(result).toBe("a");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("coerceEnumOrUndefined", () => {
  it("returns undefined when the value is unset", () => {
    const { logger, warns } = recordingLogger();
    const result = coerceEnumOrUndefined({
      source: "STATE_BACKEND",
      value: undefined,
      allowed: ["redis", "local"] as const,
      logger,
    });
    expect(result).toBeUndefined();
    expect(warns).toHaveLength(0);
  });

  it("returns the value unchanged when it is valid", () => {
    const { logger, warns } = recordingLogger();
    const result = coerceEnumOrUndefined({
      source: "STATE_BACKEND",
      value: "redis",
      allowed: ["redis", "local"] as const,
      logger,
    });
    expect(result).toBe("redis");
    expect(warns).toHaveLength(0);
  });

  it("warns and returns undefined when the value is invalid", () => {
    const { logger, warns } = recordingLogger();
    const result = coerceEnumOrUndefined({
      source: "STATE_BACKEND",
      value: "mysql",
      allowed: ["redis", "local"] as const,
      logger,
    });
    expect(result).toBeUndefined();
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('STATE_BACKEND="mysql"');
  });
});

describe("resolveStoreMode", () => {
  it("defaults to sqlite in standalone mode", () => {
    const { logger, warns } = recordingLogger();
    expect(resolveStoreMode(undefined, "standalone", logger)).toBe("sqlite");
    expect(warns).toHaveLength(0);
  });

  it("defaults to tcvdb in service mode", () => {
    const { logger, warns } = recordingLogger();
    expect(resolveStoreMode(undefined, "service", logger)).toBe("tcvdb");
    expect(warns).toHaveLength(0);
  });

  it("honours an explicit valid override", () => {
    const { logger, warns } = recordingLogger();
    expect(resolveStoreMode("tcvdb", "standalone", logger)).toBe("tcvdb");
    expect(warns).toHaveLength(0);
  });

  it("warns and falls back when STORE_MODE is invalid", () => {
    const { logger, warns } = recordingLogger();
    // Bug fix: "mongodb" must warn instead of silently becoming the deploy default.
    const result = resolveStoreMode("mongodb", "standalone", logger);
    expect(result).toBe("sqlite");
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('STORE_MODE="mongodb"');
  });
});
