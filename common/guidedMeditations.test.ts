import { describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  GUIDED_MEDITATIONS,
  getGuidedMeditation,
  isApprovedYouTubeUrl,
  openGuidedMeditation,
  type GuidedMeditation,
} from "./guidedMeditations";
import type { CanonicalEmotionKey } from "./emotionRouting";
import { PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY, getCanonicalEmotionForRouting } from "./emotionTaxonomy";
import { PRODUCT_SPEC_PATH, readZipEntry } from "../test-utils/docx";

const root = path.resolve(__dirname, "..");
const ALL_KEYS: CanonicalEmotionKey[] = ["worried", "angry", "embarrassed", "guilty", "sad", "tired", "happy", "calm"];

/** Emotion -> YouTube URL exactly as hyperlinked in the product specification. */
function specVideoLinks(): Record<string, string> {
  const rels = readZipEntry(PRODUCT_SPEC_PATH, "word/_rels/document.xml.rels");
  const doc = readZipEntry(PRODUCT_SPEC_PATH, "word/document.xml");
  const targets: Record<string, string> = {};
  for (const rel of rels.match(/<Relationship [^>]*>/g) ?? []) {
    const id = /Id="([^"]+)"/.exec(rel)?.[1];
    const target = /Target="([^"]+)"/.exec(rel)?.[1];
    if (id && target?.includes("youtube")) targets[id] = target;
  }
  const byEmotion: Record<string, string> = {};
  for (const para of doc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = para.replace(/<[^>]+>/g, "");
    for (const m of para.matchAll(/<w:hyperlink[^>]*r:id="([^"]+)"/g)) {
      const url = targets[m[1]];
      if (!url) continue;
      const label = text.split("—")[0].toLowerCase();
      const key = ALL_KEYS.find((k) => label.includes(k)) ?? label;
      byEmotion[key] = url;
    }
  }
  return byEmotion;
}

describe("guided meditation configuration", () => {
  test("matches the eight emotion links in the product specification exactly", () => {
    const spec = specVideoLinks();
    expect(Object.keys(spec).sort()).toEqual([...ALL_KEYS].sort());
    for (const key of ALL_KEYS) {
      expect(GUIDED_MEDITATIONS[key].url, key).toBe(spec[key]);
    }
  });

  test("one approved entry per canonical emotion, with unique valid URLs", () => {
    expect(Object.keys(GUIDED_MEDITATIONS).sort()).toEqual([...ALL_KEYS].sort());
    const urls = ALL_KEYS.map((k) => GUIDED_MEDITATIONS[k].url);
    expect(new Set(urls).size).toBe(8);
    for (const key of ALL_KEYS) {
      const m = GUIDED_MEDITATIONS[key];
      expect(m.emotion, key).toBe(key);
      expect(m.title.length, key).toBeGreaterThan(0);
      expect(isApprovedYouTubeUrl(m.url), key).toBe(true);
      expect(getGuidedMeditation(key), key).toBe(m);
    }
  });

  test("only well-formed https YouTube watch URLs are accepted", () => {
    expect(isApprovedYouTubeUrl("https://www.youtube.com/watch?v=O-6f5wQXSu8")).toBe(true);
    expect(isApprovedYouTubeUrl("https://m.youtube.com/watch?v=O-6f5wQXSu8")).toBe(true);
    for (const bad of [
      undefined,
      null,
      "",
      "not a url",
      "http://www.youtube.com/watch?v=O-6f5wQXSu8",
      "https://www.youtube.com.evil.example/watch?v=O-6f5wQXSu8",
      "https://evil.example/?u=https://www.youtube.com/watch?v=O-6f5wQXSu8",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=O-6f5wQXSu8&list=x",
      "javascript:alert(1)",
    ]) {
      expect(isApprovedYouTubeUrl(bad), String(bad)).toBe(false);
    }
  });

  test("missing emotion or an invalid configured URL yields no meditation", () => {
    expect(getGuidedMeditation(null)).toBeNull();
    expect(getGuidedMeditation(undefined)).toBeNull();
    expect(getGuidedMeditation("unknown" as CanonicalEmotionKey)).toBeNull();
    const original = GUIDED_MEDITATIONS.sad.url;
    try {
      GUIDED_MEDITATIONS.sad.url = "https://example.com/video";
      expect(getGuidedMeditation("sad")).toBeNull();
    } finally {
      GUIDED_MEDITATIONS.sad.url = original;
    }
  });
});

describe("opening a guided meditation", () => {
  test("opens exactly the configured URL for each emotion", async () => {
    for (const key of ALL_KEYS) {
      const open = vi.fn().mockResolvedValue(true);
      await expect(openGuidedMeditation(getGuidedMeditation(key), open)).resolves.toBe("opened");
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith(GUIDED_MEDITATIONS[key].url);
    }
  });

  test("reports failure when the OS cannot open the URL, without throwing", async () => {
    const open = vi.fn().mockRejectedValue(new Error("No Activity found to handle Intent"));
    await expect(openGuidedMeditation(GUIDED_MEDITATIONS.calm, open)).resolves.toBe("failed");
  });

  test("never calls the opener for a missing or invalid meditation", async () => {
    const open = vi.fn();
    await expect(openGuidedMeditation(null, open)).resolves.toBe("invalid");
    const bad: GuidedMeditation = { emotion: "calm", title: "x", url: "https://example.com" };
    await expect(openGuidedMeditation(bad, open)).resolves.toBe("invalid");
    expect(open).not.toHaveBeenCalled();
  });

  test("with the current check-in, meditations can appear for happy, sad, angry and calm only", () => {
    const reachable = new Set<CanonicalEmotionKey>();
    for (const { id } of PRIMARY_EMOTIONS) {
      reachable.add(getCanonicalEmotionForRouting(id, null));
      for (const s of SECONDARY_EMOTIONS_BY_PRIMARY[id]) reachable.add(getCanonicalEmotionForRouting(id, s));
    }
    expect([...reachable].sort()).toEqual(["angry", "calm", "happy", "sad"]);
    for (const key of reachable) expect(getGuidedMeditation(key), key).not.toBeNull();
  });
});

describe("Emotion Map integration", () => {
  const screen = fs.readFileSync(path.join(root, "app/(auth)/tools/emotion-map.tsx"), "utf-8");
  const handler = screen.slice(
    screen.indexOf("const handleOpenGuidedMeditation"),
    screen.indexOf("// Step 5: Start the routed intervention")
  );
  const step5 = screen.slice(screen.indexOf("{step === 5 && routedIntervention && ("), screen.indexOf("{/* STEP 6"));

  test("the meditation is looked up from the emotion that produced the recommendation", () => {
    expect(screen).toContain("getGuidedMeditation(routedEmotionKey)");
    expect(screen.match(/setRoutedEmotionKey\(/g)).toHaveLength(1);
    expect(screen).toMatch(/setRoutedIntervention\(intervention\);\s*setRoutedEmotionKey\(canonicalEmotion\);/);
  });

  test("it opens externally only on tap, and a failure keeps the built-in exercise", () => {
    expect(screen.match(/openGuidedMeditation\(/g)).toHaveLength(1);
    expect(handler).toContain("Linking.openURL(url)");
    expect(handler).toContain('if (result !== "opened")');
    expect(handler).toContain("You can still try the exercise above.");
  });

  test("opening it creates no check-in, changes no step and skips no post-check", () => {
    for (const forbidden of ["createEmotionLog", "createEmotionMap", "setStep(", "router.", "recordPostIntensity", "setRoutedIntervention"]) {
      expect(handler, forbidden).not.toContain(forbidden);
    }
  });

  test("the built-in action stays primary and the meditation row is optional and secondary", () => {
    const start = step5.indexOf("onPress={handleStartIntervention}");
    const row = step5.indexOf("{guidedMeditation && (");
    const later = step5.indexOf("Maybe later");
    expect(start).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(start);
    expect(later).toBeGreaterThan(row);
    expect(step5).toContain("Guided meditation · Optional");
    expect(step5).toContain('accessibilityRole="link"');
    expect(step5).toContain('accessibilityHint="Opens YouTube outside Emotify"');
  });

  test("the row's text wraps instead of overflowing", () => {
    const style = (name: string) => screen.slice(screen.indexOf(`  ${name}: {`), screen.indexOf("},", screen.indexOf(`  ${name}: {`)));
    expect(style("meditationTextCol")).toContain("flex: 1");
    expect(style("meditationRow")).toContain("minHeight: 56");
    const rowJsx = step5.slice(step5.indexOf("{guidedMeditation && ("));
    expect(rowJsx).not.toContain("numberOfLines");
  });
});
