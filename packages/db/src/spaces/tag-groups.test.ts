import { describe, expect, it } from "vitest";
import { tagTeams } from "./tag-groups.js";

describe("tagTeams", () => {
  it("puts every bot under each of its tags, whatever their case, in bot order", () => {
    const teams = tagTeams([
      { id: "chief", tags: ["Chief", "Marketing"] },
      { id: "ads", tags: ["marketing"] },
      { id: "cfo", tags: ["chief", "Finance"] },
    ]);
    expect(Object.fromEntries(teams)).toEqual({
      chief: { name: "Chief", botIds: ["chief", "cfo"] },
      marketing: { name: "Marketing", botIds: ["chief", "ads"] },
      finance: { name: "Finance", botIds: ["cfo"] },
    });
  });
});
