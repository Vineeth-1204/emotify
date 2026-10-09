import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  BODY_REGIONS,
  BODY_SENSATIONS,
  HELP_ME_NOTICE_STEPS,
  NOTICE_STEP_MS,
  getBodySensations,
  includesWholeBody,
  regionsForSensations,
  type BodyRegion,
} from "./bodySensations";
import type { CanonicalEmotionKey } from "./emotionRouting";
import { PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY, getCanonicalEmotionForRouting } from "./emotionTaxonomy";
import { readSpecTables } from "../test-utils/docx";

const screen = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/tools/emotion-map.tsx"), "utf-8");
const ALL_KEYS: CanonicalEmotionKey[] = ["happy", "calm", "sad", "worried", "angry", "embarrassed", "guilty", "tired"];
const SPEC_ROW: Record<string, CanonicalEmotionKey> = {
  E01: "happy", E02: "calm", E03: "sad", E04: "worried", E05: "angry", E06: "embarrassed", E07: "guilty", E08: "tired",
};

/** Words a sensation must contain to be placed in a region (keeps the mapping literal). */
const REGION_WORDS: Record<BodyRegion, RegExp> = {
  Head: /face|jaw|head|eyes|tears|smiling/i,
  Shoulders: /shoulders/i,
  Chest: /chest|heartbeat|breathing/i,
  Stomach: /stomach/i,
  Hands: /hands/i,
  Legs: /legs/i,
};

function section(start: string, end: string) {
  return screen.slice(screen.indexOf(start), screen.indexOf(end, screen.indexOf(start)));
}

describe("body sensations come from the product specification", () => {
  test("each emotion lists exactly the spec's 'Possible body sensations', in order", () => {
    const table = readSpecTables().find((t) => t[0]?.some((c) => /possible body sensations/i.test(c)));
    expect(table).toBeDefined();
    const col = table![0].findIndex((c) => /possible body sensations/i.test(c));
    const seen = new Set<string>();
    for (const row of table!.slice(1)) {
      const key = SPEC_ROW[row[0]];
      if (!key) continue;
      seen.add(key);
      const spec = row[col].split(";").map((s) => s.trim().toLowerCase()).filter(Boolean);
      expect(BODY_SENSATIONS[key].map((s) => s.label.toLowerCase()), key).toEqual(spec);
    }
    expect([...seen].sort()).toEqual([...ALL_KEYS].sort());
  });

  test("sensations are only placed in a figure region the wording names", () => {
    for (const key of ALL_KEYS) {
      for (const s of BODY_SENSATIONS[key]) {
        for (const region of s.regions) {
          expect(BODY_REGIONS).toContain(region);
          expect(s.label, `${key}: ${s.label} -> ${region}`).toMatch(REGION_WORDS[region]);
        }
        if (s.wholeBody) expect(s.regions).toEqual([]);
      }
    }
  });

  test("every emotion reachable from the check-in has sensation choices", () => {
    for (const { id } of PRIMARY_EMOTIONS) {
      for (const secondary of [null, ...SECONDARY_EMOTIONS_BY_PRIMARY[id]]) {
        const key = getCanonicalEmotionForRouting(id, secondary);
        expect(getBodySensations(key).length, `${id}/${secondary}`).toBeGreaterThanOrEqual(6);
      }
    }
    expect(getBodySensations(null)).toEqual([]);
  });
});

describe("sensation to region feedback", () => {
  test("multiple selections combine into unique regions in figure order", () => {
    expect(regionsForSensations("sad", ["Heavy legs", "Heavy chest", "Tears", "Heavy head"])).toEqual(["Head", "Chest", "Legs"]);
    expect(regionsForSensations("angry", ["Fast heartbeat", "Tight chest"])).toEqual(["Chest"]);
    expect(regionsForSensations("calm", [])).toEqual([]);
  });

  test("whole-body and unplaced sensations light the figure but save no region", () => {
    expect(regionsForSensations("sad", ["Tired body", "Low energy", "Lump in throat"])).toEqual([]);
    expect(includesWholeBody("sad", ["Tired body"])).toBe(true);
    expect(includesWholeBody("sad", ["Lump in throat"])).toBe(false);
  });

  test("labels from another emotion's list are ignored", () => {
    expect(regionsForSensations("calm", ["Hot face", "Heavy legs"])).toEqual([]);
  });

  test("the figure draws every region and is feedback only (no tapping)", () => {
    const figure = section("<View style={styles.bodyFigureWrap}", "</Svg>");
    for (const region of BODY_REGIONS) expect(figure).toContain(`regionFill("${region}")`);
    expect(figure).not.toContain("onPress");
    expect(figure).toContain('pointerEvents="none"');
    expect(figure).toContain('importantForAccessibility="no-hide-descendants"');
  });
});

describe("step 3: How does it feel in your body?", () => {
  const step3 = section("{step === 3 && (", "{/* STEP 4: Intensity */}");

  test("one question, sensation chips, and a Continue that never needs a selection", () => {
    expect(step3).toContain("How does it feel in your body?");
    expect(step3).toContain("Pick anything that fits.");
    expect(step3).not.toContain("Where do you notice it most?");
    expect(step3).toContain("sensationOptions.map(");
    expect(step3).toContain('accessibilityRole="checkbox"');
    expect(step3).toContain("accessibilityState={{ checked: isSelected }}");
    expect(step3).toContain('<Button title="Continue" onPress={handleContinueFromStep3} style={styles.halfBtn} />');
    expect(screen).toMatch(/const handleContinueFromStep3 = \(\) => \{[\s\S]*?setStep\(4\);/);
  });

  test("chip text wraps inside the chip on narrow phones", () => {
    const style = (name: string) => screen.slice(screen.indexOf(`  ${name}: {`), screen.indexOf("},", screen.indexOf(`  ${name}: {`)));
    expect(style("sensationChip")).toContain('maxWidth: "100%"');
    expect(style("sensationChipText")).toContain("flexShrink: 1");
    expect(style("secondaryGrid")).toContain('flexWrap: "wrap"');
  });

  test("saved regions come from the chosen sensations; 'Not really' saves none", () => {
    expect(screen).toContain("isUnsureBody ? [] : regionsForSensations(canonicalEmotion, selectedSensations)");
    expect(screen).not.toContain("toggleRegion(");
  });
});

describe("Help me notice", () => {
  test("head, shoulders, chest, stomach for about 15–20 seconds, with no breathing pattern", () => {
    expect(HELP_ME_NOTICE_STEPS.map((s) => s.region)).toEqual(["Head", "Shoulders", "Chest", "Stomach"]);
    const total = HELP_ME_NOTICE_STEPS.length * NOTICE_STEP_MS;
    expect(total).toBeGreaterThanOrEqual(15000);
    expect(total).toBeLessThanOrEqual(20000);
    for (const s of HELP_ME_NOTICE_STEPS) expect(s.line).not.toMatch(/breath|inhale|exhale|hold/i);
  });

  test("it can be skipped, ends with the sensations or 'Not really', and stops when leaving the step", () => {
    const step3 = section("{step === 3 && (", "{/* STEP 4: Intensity */}");
    expect(step3).toContain("onPress={handleStartNotice}");
    expect(step3).toContain("onPress={handleSkipNotice}");
    expect(step3).toContain('noticeFinished ? "Anything stand out?"');
    expect(step3).toContain("onPress={handleNothingNoticed}");
    expect(screen).toMatch(/const handleSkipNotice = \(\) => setNoticeIndex\(HELP_ME_NOTICE_STEPS\.length\);/);
    expect(screen).toMatch(/const handleNothingNoticed = \(\) => \{[\s\S]*?setIsUnsureBody\(true\);[\s\S]*?setStep\(4\);/);
    const timer = section("// Help me notice: advance one region", "// Step 1: User selects a primary emotion");
    expect(timer).toContain("if (step !== 3)");
    expect(timer).toContain("clearTimeout(timer)");
    expect(timer).toContain("AccessibilityInfo.announceForAccessibility");
  });
});

describe("saving and the 1–10 intensity scale are unchanged", () => {
  const save = section("const handleContinueFromStep4 = async () => {", "// Phase 3 — Save pending state");

  test("the recommendation only appears after both records are saved", () => {
    const logAt = save.indexOf("await createEmotionLog(");
    const mapAt = save.indexOf("await createEmotionMap(");
    const nextAt = save.indexOf("setStep(5)");
    expect(logAt).toBeGreaterThan(-1);
    expect(mapAt).toBeGreaterThan(logAt);
    expect(nextAt).toBeGreaterThan(mapAt);
    expect(save).toContain('Alert.alert("Error", "Could not record your check-in. Please try again.")');
  });

  test("intensity is still the 1–10 value from the existing selector", () => {
    expect(save).toContain("preIntensity: intensity,");
    expect(save).toContain("averageIntensity: intensity,");
    expect(screen).toContain("<IntensitySelector value={intensity} onChange={setIntensity}");
    expect(screen).toContain("{intensityPrompt(secondaryEmotion)}");
  });

  test("History gets a readable label (the chosen feeling, or the broad emotion's label)", () => {
    expect(save).toContain("emotionLabel: historyLabel,");
    expect(save).toContain("const historyLabel = secondaryEmotion || PRIMARY_EMOTIONS.find((e) => e.id === primaryEmotion)?.label || primaryEmotion;");
  });
});
