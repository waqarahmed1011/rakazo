import { afterEach, describe, expect, it, vi } from "vitest";
import { isWhiteLabeled, productName } from "./product-name.js";

describe("productName", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to Rakazo", () => {
    vi.stubEnv("INSTANCE_NAME", "");
    expect(productName()).toBe("Rakazo");
    expect(isWhiteLabeled()).toBe(false);
  });

  it("uses the instance name when set", () => {
    vi.stubEnv("INSTANCE_NAME", " JBW ");
    expect(productName()).toBe("JBW");
    expect(isWhiteLabeled()).toBe(true);
  });
});
