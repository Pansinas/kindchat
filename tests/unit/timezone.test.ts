import { describe, expect, it } from "vitest";
import { clocksDiffer, localTimeLabel, offsetMinutes } from "@/lib/domain/timezone";

const summer = new Date("2026-07-01T20:44:00Z");
const winter = new Date("2026-01-15T20:44:00Z");

describe("offsetMinutes", () => {
  it("reads fixed and half-hour offsets", () => {
    expect(offsetMinutes("UTC", summer)).toBe(0);
    expect(offsetMinutes("Asia/Kolkata", summer)).toBe(330);
    expect(offsetMinutes("America/New_York", summer)).toBe(-240);
    expect(offsetMinutes("America/New_York", winter)).toBe(-300);
  });
  it("returns null for unknown zones", () => {
    expect(offsetMinutes("Not/AZone", summer)).toBeNull();
  });
});

describe("clocksDiffer", () => {
  it("is false for the same zone or zones with the same offset", () => {
    expect(clocksDiffer("Asia/Kolkata", "Asia/Kolkata", summer)).toBe(false);
    expect(clocksDiffer("Asia/Kolkata", "Asia/Calcutta", summer)).toBe(false);
    expect(clocksDiffer("Europe/London", "UTC", winter)).toBe(false);
  });
  it("is true when the clocks differ", () => {
    expect(clocksDiffer("Asia/Kolkata", "Europe/London", summer)).toBe(true);
    // London matches UTC in winter but not in summer.
    expect(clocksDiffer("Europe/London", "UTC", summer)).toBe(true);
  });
  it("is false when either zone is unknown", () => {
    expect(clocksDiffer(null, "Asia/Kolkata", summer)).toBe(false);
    expect(clocksDiffer("Asia/Kolkata", undefined, summer)).toBe(false);
    expect(clocksDiffer("Asia/Kolkata", "Not/AZone", summer)).toBe(false);
  });
});

describe("localTimeLabel", () => {
  it("adds the weekday only when it is a different day for them", () => {
    // 20:44 UTC = 02:14 next day in Kolkata, 21:44 in London (summer).
    expect(localTimeLabel("Asia/Kolkata", "Europe/London", summer)).toMatch(/^Thu .*2:14/);
    expect(localTimeLabel("Europe/London", "UTC", summer)).toMatch(/^9:44/);
  });
});
