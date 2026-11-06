import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  DISCOVERY_GROUP_MAX,
  PRIMARY_EMOTION_MEANINGS,
  getDiscoveryGroups,
  getPrimaryMeaningChoices,
  nextDiscoveryMode,
  previousDiscoveryMode,
  type DiscoveryMode,
} from "./emotionDiscovery";
import { PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY } from "./emotionTaxonomy";
import { readSpecTables } from "../test-utils/docx";

const screen = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/tools/emotion-map.tsx"), "utf-8");
const section = (start: string, end: string) => screen.slice(screen.indexOf(start), screen.indexOf(end, screen.indexOf(start)));
const step2 = section("{step === 2 && primaryEmotion && (", "{/* STEP 3: How does it feel in your body?");

describe("discovery uses only approved wording", () => {
  test("broad-emotion meanings are the specification's 'Simple meaning' text", () => {
    const table = readSpecTables().find((t) => t[0]?.some((c) => /simple meaning/i.test(c)))!;
    const col = table[0].findIndex((c) => /simple meaning/i.test(c));
    const byId: Record<string, string> = Object.fromEntries(table.slice(1).map((r) => [r[0], r[col]]));
    expect(PRIMARY_EMOTION_MEANINGS).toEqual({ happy: byId.E01, calm: byId.E02, sad: byId.E03, angry: byId.E05 });
    expect(getPrimaryMeaningChoices().map((c) => c.id)).toEqual(PRIMARY_EMOTIONS.map((e) => e.id));
  });

  test("groups are the existing feelings, in order, a few at a time, never one alone", () => {
    for (const { id } of PRIMARY_EMOTIONS) {
      const groups = getDiscoveryGroups(id);
      expect(groups.flat(), id).toEqual(SECONDARY_EMOTIONS_BY_PRIMARY[id].filter((f) => f !== "Not sure"));
      expect(groups.length, id).toBeGreaterThanOrEqual(1);
      for (const g of groups) {
        expect(g.length, id).toBeLessThanOrEqual(DISCOVERY_GROUP_MAX);
        expect(g.length, id).toBeGreaterThanOrEqual(2);
      }
    }
    expect(getDiscoveryGroups("sad")).toEqual([
      ["Lonely", "Disappointed", "Hurt", "Empty"],
      ["Left out", "Missing someone", "Hopeless"],
    ]);
  });
});

describe("discovery steps forward and back", () => {
  test("None of these: each group, then the broad meanings, then unresolved", () => {
    let mode: DiscoveryMode = { kind: "choose" };
    const seen: DiscoveryMode[] = [];
    for (let i = 0; i < 4; i++) seen.push((mode = nextDiscoveryMode(mode, 2)));
    expect(seen).toEqual([{ kind: "explore", group: 0 }, { kind: "explore", group: 1 }, { kind: "broad" }, { kind: "unresolved" }]);
  });

  test("Back returns to the previous step, and from the first group to the choices", () => {
    expect(previousDiscoveryMode({ kind: "unresolved" }, 2)).toEqual({ kind: "broad" });
    expect(previousDiscoveryMode({ kind: "broad" }, 2)).toEqual({ kind: "explore", group: 1 });
    expect(previousDiscoveryMode({ kind: "explore", group: 1 }, 2)).toEqual({ kind: "explore", group: 0 });
    expect(previousDiscoveryMode({ kind: "explore", group: 0 }, 2)).toEqual({ kind: "choose" });
    expect(previousDiscoveryMode({ kind: "choose" }, 2)).toEqual({ kind: "choose" });
  });
});

describe("check-in screen: 'Not sure' helps the student find the feeling", () => {
  test("'Not sure' opens discovery and selects nothing", () => {
    const handler = section("const handleUnsureSecondary = () => {", "// \"None of these\"");
    expect(handler).toContain('setDiscovery({ kind: "explore", group: 0 })');
    expect(handler).toContain("setSecondaryEmotion(null)");
    expect(handler).not.toMatch(/setStep\(|setSelectedEmotions|setStrongestEmotion/);
    expect(screen).not.toContain("is enough to go on");
    expect(screen).not.toContain("handleContinueWithPrimaryOnly");
    expect(step2).toContain("That's okay. Let's figure it out together.");
    expect(step2).toContain("Does it feel more like…");
  });

  test("a feeling picked in discovery goes through the normal selection, then Continue", () => {
    expect(screen).toMatch(/const handlePickDiscoveredFeeling = \(option: string\) => \{\s*handleSelectSecondary\(option\);\s*setDiscovery\(\{ kind: "choose" \}\);/);
    expect(step2).toContain("onPress={() => handlePickDiscoveredFeeling(option)}");
    expect(step2).toContain("onPress={handleDiscoveryNone}");
    expect(step2).toContain("onPress={() => handlePickBroadMeaning(choice.id)}");
    expect(screen).toContain("const handlePickBroadMeaning = (id: PrimaryEmotionId) => handleSelectPrimary(id);");
  });

  test("Back steps back through discovery (button, header and Android back)", () => {
    expect(step2).toContain('<Button title="Back" onPress={handleDiscoveryBack} variant="outline" style={styles.halfBtn} />');
    expect(screen).toMatch(/if \(step === 2 && discovery\.kind !== "choose"\) \{\s*setDiscovery\(previousDiscoveryMode\(discovery, discoveryGroups\.length\)\);/);
    expect(screen).toMatch(/\} else if \(step === 2 && discovery\.kind !== "choose"\) \{\s*handleDiscoveryBack\(\);/);
  });

  test("remaining unsure never becomes an emotion: no Continue, and leaving saves nothing", () => {
    // The only Continue in step 2 is in "choose" mode and needs a picked feeling
    expect(step2.match(/title="Continue"/g)).toHaveLength(1);
    expect(step2).toMatch(/discovery\.kind === "choose" \? \([\s\S]*?title="Continue"[\s\S]*?disabled=\{!secondaryEmotion\}/);
    expect(screen).toMatch(/const handleContinueFromStep2 = \(\) => \{\s*if \(!secondaryEmotion\) return;/);
    // Every assignment of the specific feeling is the student's own pick or a clear
    for (const call of screen.match(/setSecondaryEmotion\(([^)]*)\)/g) ?? []) {
      expect(["setSecondaryEmotion(option)", "setSecondaryEmotion(null)"]).toContain(call);
    }
    expect(step2).toContain("Without a feeling, this check-in won't be saved.");
    expect(step2).toContain("Still not sure");
    expect(step2).toContain("Try again");
    expect(step2).toContain("Back to the feelings");
    expect(step2).toContain('accessibilityHint="Leaves the check-in without saving it"');
    expect(screen.match(/setStep\(6\)/g)).toHaveLength(1);
    expect(screen).toMatch(/const handleSkipToCalmingActivity = \(\) => \{[\s\S]*?setStep\(6\);/);
  });

  test("the check-in is only saved with a feeling and a 1–10 intensity from the student", () => {
    const save = section("const handleContinueFromStep4 = async () => {", "// Phase 3 — Save pending state");
    expect(save).toContain("const logEmotion = secondaryEmotion || primaryEmotion;");
    expect(save).toContain("preIntensity: intensity,");
    // Step 4 is only reached from step 3, which is only reached from a confirmed step 2
    expect(screen).toMatch(/const handleContinueFromStep2 = \(\) => \{\s*if \(!secondaryEmotion\) return;[\s\S]*?setStep\(3\);/);
  });

  test("meaning cards wrap on narrow phones", () => {
    const style = (name: string) => screen.slice(screen.indexOf(`  ${name}: {`), screen.indexOf("},", screen.indexOf(`  ${name}: {`)));
    expect(style("meaningCard")).not.toMatch(/width:|height:/);
    expect(step2).not.toContain("numberOfLines");
  });
});
