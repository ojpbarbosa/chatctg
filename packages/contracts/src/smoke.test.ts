import { describe, expect, it } from "vitest";
import { VERSION } from "./index";

describe("workspace", () => {
  it("resolves the contracts package", () => {
    expect(VERSION).toBe("chatctg/0.1.0");
  });
});
