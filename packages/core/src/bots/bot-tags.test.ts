import { describe, expect, it } from "vitest";
import { botTagKey, normalizeBotTags, spaceBotTags } from "./bot-tags.js";

describe("bot tags", () => {
  it("keeps the first spelling of a tag and drops repeats and blanks", () => {
    expect(
      normalizeBotTags([" Marketing ", "marketing", "", "Chief  of Staff", "chief of staff"]),
    ).toEqual(["Marketing", "Chief of Staff"]);
  });

  it("matches tags regardless of case and spacing", () => {
    expect(botTagKey("  Chief   Of Staff ")).toBe("chief of staff");
  });

  it("lists each tag in the space once, by name", () => {
    expect(
      spaceBotTags([{ tags: ["Projects", "Chief"] }, { tags: ["chief", "Marketing"] }, {}]),
    ).toEqual(["Chief", "Marketing", "Projects"]);
  });
});
