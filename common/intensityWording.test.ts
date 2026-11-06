import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  INTENSITY_BAND_LABELS,
  getIntensityLevel,
  intensityBand,
  intensityPrompt,
  toneForEmotion,
  toneForFeeling,
  type FeelingTone,
} from "./intensityWording";
import { getCanonicalEmotionForRouting, PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY, type PrimaryEmotionId } from "./emotionTaxonomy";
import { determineIntervention } from "./emotionRouting";
import { PRODUCT_SPEC_PATH, readZipEntry } from "../test-utils/docx";

const screen = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/tools/emotion-map.tsx"), "utf-8");
const DISTRESS = /distress|intervention|crisis|emergency|demands|hard to ignore|attention|focus/i;
const POSITIVE_OR_CALM = /good feeling|settled|calm|at ease/i;
const RED = "#EF4444";

/** What the intensity step shows for a check-in: Emoty's prompt and the selector's label/caption/colour. */
function intensityScreen(primary: PrimaryEmotionId, feeling: string | null, value: number) {
  return { prompt: intensityPrompt(feeling), ...getIntensityLevel(value, toneForEmotion(primary)) };
}

describe("bug report scenarios at intensity 10", () => {
  test("Happy → Relieved → 10 names the feeling and describes a strong good feeling", () => {
    const s = intensityScreen("happy", "Relieved", 10);
    expect(s.prompt).toBe("Rate how relieved you feel, from 1 to 10.");
    expect(s.text).toBe("Very strong");
    expect(s.desc).toBe("A very strong good feeling right now.");
    expect(s.desc).not.toMatch(DISTRESS);
    expect(s.color).not.toBe(RED);
  });

  test("Happy → Hopeful → 10", () => {
    const s = intensityScreen("happy", "Hopeful", 10);
    expect(s.prompt).toBe("Rate how hopeful you feel, from 1 to 10.");
    expect(s.desc).toBe("A very strong good feeling right now.");
  });

  test("Calm → 10 is very calm, not distress", () => {
    const s = intensityScreen("calm", "Peaceful", 10);
    expect(s.prompt).toBe("Rate how peaceful you feel, from 1 to 10.");
    expect(s.desc).toBe("Very calm and at ease.");
    expect(s.color).not.toBe(RED);
  });

  test("Sad → 10 and Angry → 10 are very strong difficult feelings, without implying a crisis", () => {
    for (const [primary, feeling] of [["sad", "Lonely"], ["angry", "Frustrated"]] as const) {
      const s = intensityScreen(primary, feeling, 10);
      expect(s.prompt).toBe(`Rate how ${feeling.toLowerCase()} you feel, from 1 to 10.`);
      expect(s.text).toBe("Very strong");
      expect(s.desc).toBe("Very strong. It's taking up a lot of your attention right now.");
      expect(s.desc).not.toMatch(/distress|intervention|crisis|emergency|demands/i);
      expect(s.desc).not.toMatch(POSITIVE_OR_CALM);
    }
  });
});

describe("wording follows the selected feeling across the whole scale", () => {
  test("the prompt names every feeling the check-in offers, as the student chose it", () => {
    for (const { id } of PRIMARY_EMOTIONS) {
      for (const feeling of SECONDARY_EMOTIONS_BY_PRIMARY[id].filter((f) => f !== "Not sure")) {
        const prompt = intensityPrompt(feeling);
        expect(prompt.toLowerCase(), feeling).toContain(feeling.toLowerCase().replace("missing someone", "missing someone"));
        expect(prompt, feeling).toMatch(/from 1 to 10\.$/);
      }
    }
    expect(intensityPrompt("Missing someone")).toBe("Rate how much you're missing someone, from 1 to 10.");
    expect(intensityPrompt(null)).toBe("Rate how strong it feels, from 1 to 10.");
  });

  test("positive and calming feelings never get distress wording; difficult ones never get good-feeling wording", () => {
    for (let v = 1; v <= 10; v++) {
      for (const tone of ["positive", "calming"] as FeelingTone[]) {
        const l = getIntensityLevel(v, tone);
        expect(l.desc, `${tone}@${v}`).not.toMatch(DISTRESS);
        expect(l.color, `${tone}@${v}`).not.toBe(RED);
      }
      const d = getIntensityLevel(v, "difficult");
      expect(d.desc, `difficult@${v}`).not.toMatch(POSITIVE_OR_CALM);
      expect(d.desc, `difficult@${v}`).not.toMatch(/intervention|crisis|emergency|demands/i);
    }
  });

  test("tone comes from the broad emotion, for every feeling", () => {
    const expected: Record<PrimaryEmotionId, FeelingTone> = { happy: "positive", calm: "calming", sad: "difficult", angry: "difficult" };
    for (const { id } of PRIMARY_EMOTIONS) {
      expect(toneForEmotion(id)).toBe(expected[id]);
      for (const f of SECONDARY_EMOTIONS_BY_PRIMARY[id].filter((x) => x !== "Not sure")) {
        expect(toneForEmotion(getCanonicalEmotionForRouting(id, f)), `${id}/${f}`).toBe(expected[id]);
      }
    }
    for (const k of ["worried", "embarrassed", "guilty", "tired"] as const) expect(toneForEmotion(k)).toBe("difficult");
  });

  test("History colours use the saved feeling's tone", () => {
    expect(toneForFeeling("Relieved")).toBe("positive");
    expect(toneForFeeling("Peaceful")).toBe("calming");
    expect(toneForFeeling("Hurt")).toBe("difficult");
    expect(toneForFeeling("Sad")).toBe("difficult");
    expect(["positive", "calming"]).toContain(toneForFeeling("Content"));
    expect(toneForFeeling("something legacy")).toBe("difficult");
  });
});

describe("scale, labels, storage and routing are unchanged", () => {
  test("the five 1–10 bands keep their boundaries; labels use the specification's anchors", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(intensityBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    const spec = readZipEntry(PRODUCT_SPEC_PATH, "word/document.xml").replace(/<[^>]+>/g, "");
    for (const anchor of ["Light", "Medium", "Strong", "Very Strong"]) expect(spec).toContain(`"${anchor},"`.replace(`"Very Strong,"`, `"Very Strong"`));
    expect(INTENSITY_BAND_LABELS).toEqual(["Very light", "Light", "Medium", "Strong", "Very strong"]);
  });

  test("routing still depends only on the emotion and the same 1–10 number", () => {
    expect(determineIntervention("happy", 10).interventionType).toBe("microgoals");
    expect(determineIntervention("sad", 10).interventionType).toBe("grounding");
    expect(determineIntervention("sad", 7).interventionType).toBe("reframe");
    expect(determineIntervention("angry", 10).interventionType).toBe("jpmr");
    expect(determineIntervention("calm", 10).interventionType).toBe("breathing");
  });

  test("the screen renders this wording and still saves the raw 1–10 value", () => {
    expect(screen).toContain("{intensityPrompt(secondaryEmotion)}");
    expect(screen).toContain("tone={toneForEmotion(primaryEmotion)}");
    expect(screen).toContain("const level = getIntensityLevel(value, tone);");
    expect(screen).toContain("getIntensityLevel(Math.round(log.averageIntensity), toneForFeeling(log.emotionLabel))");
    expect(screen).not.toContain("getIntensityLabel");
    expect(screen).not.toMatch(/Overwhelming distress|Strong distress|Rate the intensity of/);
    expect(screen).toContain("preIntensity: intensity,");
    expect(screen).toContain("averageIntensity: intensity,");
    expect(screen).toContain("const intervention = determineIntervention(canonicalEmotion, intensity);");
  });

  test("feeling chips keep their width when selected (no row jump under the finger)", () => {
    const style = (name: string) => screen.slice(screen.indexOf(`  ${name}: {`), screen.indexOf("},", screen.indexOf(`  ${name}: {`)));
    expect(style("secondaryChipTextSelected")).not.toContain("fontFamily");
    expect(screen.match(/name=\{isSelected \? "checkmark-circle" : "ellipse-outline"\}/g)).toHaveLength(2);
    const chipSteps = screen.slice(screen.indexOf("{step === 2 && primaryEmotion && ("), screen.indexOf("{/* STEP 4: Intensity */}"));
    expect(chipSteps).not.toMatch(/\{isSelected && \(?\s*<Ionicons/);
  });
});
