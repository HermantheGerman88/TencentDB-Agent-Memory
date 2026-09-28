import { describe, it, expect } from "vitest";
import { VectorStore, buildFtsQuery } from "./sqlite.js";
import type { L0Record } from "./types.js";

/**
 * Regression tests for the FTS5 isolation push-down.
 *
 * Before the fix, `searchL0Fts` retrieved a fixed top-N *unfiltered*
 * (`max(limit*5, limit)`) and applied `rowMatchesIsolation` in JS. With a
 * selective tenant that starves the result set — the C1 benchmark measured
 * 1 hit of 5 requested at 100k docs. These tests pin the corrected behaviour:
 * the isolation filter runs in SQL, so `LIMIT` applies to the filtered stream.
 */

const RARE = "zzqraretoken";

function makeStore(): VectorStore {
  const store = new VectorStore(":memory:", 0);
  store.init();
  return store;
}

function l0(id: string, teamId: string, userId: string, agentId: string, text = `${RARE} doc ${id}`): L0Record {
  return {
    id,
    sessionKey: `sess-${id}`,
    sessionId: `sess-${id}`,
    teamId,
    userId,
    agentId,
    role: "user",
    messageText: text,
    recordedAt: new Date(0).toISOString(),
    timestamp: 0,
  };
}

describe("VectorStore.searchL0Fts — isolation push-down", () => {
  it("returns up to `limit` in-tenant rows even when the tenant is a tiny fraction", () => {
    const store = makeStore();

    // 100 other-tenant docs all matching the rare token...
    for (let i = 0; i < 100; i++) {
      store.upsertL0(l0(`other-${i}`, `team-${i}`, `user-${i}`, `agent-${i}`), undefined);
    }
    // ...and 5 docs in the target tenant, also matching.
    for (let i = 0; i < 5; i++) {
      store.upsertL0(l0(`target-${i}`, "team-0", "user-0", "agent-0"), undefined);
    }

    const q = buildFtsQuery(RARE)!;
    const hits = store.searchL0Fts(q, 5, { teamId: "team-0", userId: "user-0", agentId: "agent-0" });

    // The old post-filter path returned ~1 (4.8 % tenant share of a top-25).
    expect(hits.length).toBe(5);
    expect(hits.every((h) => h.team_id === "team-0")).toBe(true);
  });

  it("never leaks rows from other tenants", () => {
    const store = makeStore();
    for (let i = 0; i < 20; i++) {
      store.upsertL0(l0(`a-${i}`, "team-A", "user-A", "agent-A"), undefined);
      store.upsertL0(l0(`b-${i}`, "team-B", "user-B", "agent-B"), undefined);
    }
    const q = buildFtsQuery(RARE)!;
    const hits = store.searchL0Fts(q, 50, { teamId: "team-A" });
    expect(hits.length).toBe(20);
    expect(hits.every((h) => h.team_id === "team-A")).toBe(true);
  });

  it("honours the limit when the tenant has more matches than requested", () => {
    const store = makeStore();
    for (let i = 0; i < 30; i++) {
      store.upsertL0(l0(`t-${i}`, "team-0", "user-0", "agent-0"), undefined);
    }
    const q = buildFtsQuery(RARE)!;
    expect(store.searchL0Fts(q, 3, { teamId: "team-0" }).length).toBe(3);
    expect(store.searchL0Fts(q, 30, { teamId: "team-0" }).length).toBe(30);
  });

  it("returns unfiltered results (up to limit) when no filter is given", () => {
    const store = makeStore();
    for (let i = 0; i < 10; i++) {
      store.upsertL0(l0(`x-${i}`, "team-0", "user-0", "agent-0"), undefined);
    }
    const q = buildFtsQuery(RARE)!;
    expect(store.searchL0Fts(q, 5).length).toBe(5);
    expect(store.searchL0Fts(q, 100).length).toBe(10);
  });

  it("filters on session as well (all isolation dimensions are pushed down)", () => {
    const store = makeStore();
    store.upsertL0(l0("s1", "team-0", "user-0", "agent-0"), undefined);
    store.upsertL0(l0("s2", "team-0", "user-0", "agent-0"), undefined);
    const q = buildFtsQuery(RARE)!;
    const hits = store.searchL0Fts(q, 5, { sessionId: "sess-s1" });
    expect(hits.length).toBe(1);
    expect(hits[0].record_id).toBe("s1");
  });
});
