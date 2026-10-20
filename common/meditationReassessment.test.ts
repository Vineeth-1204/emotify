import { describe, expect, test } from "vitest";
import {
  INTENSITY_ANCHORS,
  map10ScaleToAnchor,
  evaluateReassessment,
  getIntroSupportiveMessage,
} from "./meditationReassessment";

describe("Intensity anchors (4-scale mapping)", () => {
  test("defines exactly 4 canonical intensity anchors", () => {
    expect(INTENSITY_ANCHORS).toHaveLength(4);
    expect(INTENSITY_ANCHORS[0].label).toBe("A little");
    expect(INTENSITY_ANCHORS[0].emoji).toBe("🟢");
    expect(INTENSITY_ANCHORS[1].label).toBe("Some");
    expect(INTENSITY_ANCHORS[1].emoji).toBe("🟡");
    expect(INTENSITY_ANCHORS[2].label).toBe("A lot");
    expect(INTENSITY_ANCHORS[2].emoji).toBe("🟠");
    expect(INTENSITY_ANCHORS[3].label).toBe("Overwhelming");
    expect(INTENSITY_ANCHORS[3].emoji).toBe("🔴");
  });

  test("correctly maps 10-point scale into 4 anchors", () => {
    expect(map10ScaleToAnchor(1)).toBe(1);
    expect(map10ScaleToAnchor(2)).toBe(1);
    expect(map10ScaleToAnchor(3)).toBe(1);

    expect(map10ScaleToAnchor(4)).toBe(2);
    expect(map10ScaleToAnchor(5)).toBe(2);
    expect(map10ScaleToAnchor(6)).toBe(2);

    expect(map10ScaleToAnchor(7)).toBe(3);
    expect(map10ScaleToAnchor(8)).toBe(3);

    expect(map10ScaleToAnchor(9)).toBe(4);
    expect(map10ScaleToAnchor(10)).toBe(4);
  });
});

describe("Reassessment evaluation & branching", () => {
  test("identifies improvement when post intensity is lower than pre intensity", () => {
    // 8 (anchor 3) -> anchor 2
    const res = evaluateReassessment(8, 2);
    expect(res.branch).toBe("improved");
    expect(res.delta).toBeLessThan(0);
    expect(res.primaryActionRoute).toBe("/(auth)/tools/microgoals");
    expect(res.primaryActionLabel).toContain("MicroGoal");
    expect(res.showHelplineOption).toBe(false);
  });

  test("identifies unchanged state when post intensity equals pre intensity", () => {
    // 5 (anchor 2) -> anchor 2
    const res = evaluateReassessment(5, 2);
    expect(res.branch).toBe("unchanged");
    expect(res.delta).toBe(0);
    expect(res.primaryActionRoute).toBe("/(auth)/tools/microgoals");
    expect(res.showHelplineOption).toBe(true);
  });

  test("identifies worse state when post intensity is higher than pre intensity", () => {
    // 3 (anchor 1) -> anchor 3
    const res = evaluateReassessment(3, 3);
    expect(res.branch).toBe("worse");
    expect(res.delta).toBeGreaterThan(0);
    expect(res.primaryActionRoute).toBe("/(auth)/tools/appointments");
    expect(res.primaryActionLabel).toContain("counsellor");
    expect(res.showHelplineOption).toBe(true);
  });

  test("treats anchor 4 (Overwhelming) as worse branch even if unchanged from 10", () => {
    // 10 (anchor 4) -> anchor 4
    const res = evaluateReassessment(10, 4);
    expect(res.branch).toBe("worse");
    expect(res.showHelplineOption).toBe(true);
    expect(res.primaryActionRoute).toBe("/(auth)/tools/appointments");
  });
});

describe("Introductory supportive messages", () => {
  test("returns gratitude prompt for happy state at low intensity", () => {
    const msg = getIntroSupportiveMessage("happy", 1);
    expect(msg).toContain("gratitude");
  });

  test("returns calming supportive copy for high intensity state", () => {
    const msg = getIntroSupportiveMessage("worried", 3);
    expect(msg).toContain("a lot to carry right now");
  });

  test("returns gentle default copy for standard intensity", () => {
    const msg = getIntroSupportiveMessage("calm", 2);
    expect(msg).toContain("calm moment together");
  });
});
