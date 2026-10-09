import { describe, expect, it } from "vitest";
import { pushHistory, type HistoryItem } from "./history";

const item = (id: string): HistoryItem => ({ id, query: `q${id}`, created_at: "2026-10-09T00:00:00Z", response: null, error: null });

describe("pushHistory", () => {
  it("prepends, dedupes by id and caps at 30", () => {
    let items: HistoryItem[] = [];
    for (let i = 0; i < 35; i++) items = pushHistory(items, item(String(i)));
    expect(items).toHaveLength(30); expect(items[0]!.id).toBe("34");
    items = pushHistory(items, { ...item("34"), query: "updated" });
    expect(items.filter((x) => x.id === "34")).toHaveLength(1); expect(items[0]!.query).toBe("updated");
  });
});
