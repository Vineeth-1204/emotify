import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { determineIntervention, type CanonicalEmotionKey } from "./emotionRouting";
import { PRIMARY_EMOTIONS, SECONDARY_EMOTIONS_BY_PRIMARY, getCanonicalEmotionForRouting } from "./emotionTaxonomy";
import { CHECKIN_POST_SESSION_HREF, CHECKIN_RETURN_TO, isCheckinReturn } from "./checkinReturn";
import {
  BREATHING_PROTOCOLS,
  formatProtocolDuration,
  getProtocolSessionSeconds,
  resolveActiveBreathingProtocol,
} from "../constants/BreathingProtocols";

const root = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf-8");
const emotionMap = read("app/(auth)/tools/emotion-map.tsx");

const ALL_KEYS: CanonicalEmotionKey[] = ["worried", "angry", "embarrassed", "guilty", "sad", "tired", "happy", "calm"];
const INTENSITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function startCase(type: string): string {
  const start = emotionMap.indexOf("const handleStartIntervention");
  const end = emotionMap.indexOf("// Filter logs for History View");
  const body = emotionMap.slice(start, end);
  const i = body.indexOf(`case "${type}":`);
  return i === -1 ? "" : body.slice(i, body.indexOf("break;", i));
}

describe("every emotion-to-intervention route can be started", () => {
  test("each route's tool exists and 'Let's start' handles its type", () => {
    for (const key of ALL_KEYS) {
      for (const intensity of INTENSITIES) {
        const r = determineIntervention(key, intensity);
        const where = `${key}@${intensity}`;
        expect(startCase(r.interventionType), where).not.toBe("");
        if (r.interventionType === "breathing") {
          expect(startCase("breathing"), where).toContain("setShowBreathingModal(true)");
        } else if (r.interventionType === "grounding") {
          expect(startCase("grounding"), where).toContain("setShowGroundingModal(true)");
        } else {
          // Navigated tools: the route file must exist
          const file = r.targetRoute.replace("/(auth)/tools/", "app/(auth)/tools/") + ".tsx";
          expect(fs.existsSync(path.join(root, file)), `${where} -> ${file}`).toBe(true);
          expect(startCase(r.interventionType), where).toContain(r.targetRoute);
        }
      }
    }
  });

  test("breathing routes play an active protocol and show its real length", () => {
    for (const key of ALL_KEYS) {
      for (const intensity of INTENSITIES) {
        const r = determineIntervention(key, intensity);
        if (r.interventionType !== "breathing") continue;
        const played = resolveActiveBreathingProtocol(r.protocolId);
        expect(played.isActive, `${key}@${intensity}`).toBe(true);
        expect(played.id).not.toBe("relaxing_478");
      }
    }
    // Calm asks for "resonance", which is not in the registry: it plays Box Breathing
    expect(BREATHING_PROTOCOLS.resonance).toBeUndefined();
    expect(resolveActiveBreathingProtocol(determineIntervention("calm", 5).protocolId).id).toBe("box_4444");
    expect(resolveActiveBreathingProtocol("relaxing_478").id).toBe("box_4444");
    // Box Breathing is 4 cycles of 16 s
    expect(getProtocolSessionSeconds(BREATHING_PROTOCOLS.box_4444)).toBe(64);
    expect(formatProtocolDuration(BREATHING_PROTOCOLS.box_4444)).toBe("About 1 min");
    expect(emotionMap).toContain("formatProtocolDuration(activeBreathingProtocol)");
    expect(emotionMap).toContain("{interventionDuration}");
    expect(emotionMap).not.toContain("3-minute breathing");
  });

  test("the grounding card from the screenshot opens the built-in 5-4-3-2-1 exercise", () => {
    const r = determineIntervention("sad", 8);
    expect(r).toMatchObject({ interventionType: "grounding", title: "5-4-3-2-1 Sensory Grounding" });
    expect(emotionMap).toContain("protocol={SENSORY_54321_PROTOCOL}");
    expect(emotionMap).toMatch(/onComplete=\{\(_logId\) => \{[\s\S]*?handleInlineInterventionComplete\(\)/);
  });

  test("only happy, sad, angry and calm routes are reachable from the current check-in", () => {
    const reachable = new Set<string>();
    for (const { id } of PRIMARY_EMOTIONS) {
      reachable.add(getCanonicalEmotionForRouting(id, null));
      for (const s of SECONDARY_EMOTIONS_BY_PRIMARY[id]) reachable.add(getCanonicalEmotionForRouting(id, s));
    }
    // worried / embarrassed / guilty / tired routes exist but no check-in choice leads to them
    expect([...reachable].sort()).toEqual(["angry", "calm", "happy", "sad"]);
  });
});

describe("tools opened by the check-in hand back to its re-check", () => {
  test("isCheckinReturn only accepts the check-in marker", () => {
    expect(isCheckinReturn(CHECKIN_RETURN_TO)).toBe(true);
    expect(isCheckinReturn([CHECKIN_RETURN_TO])).toBe(true);
    expect(isCheckinReturn(undefined)).toBe(false);
    expect(isCheckinReturn("dashboard")).toBe(false);
    expect(CHECKIN_POST_SESSION_HREF).toEqual({ pathname: "/(auth)/tools/emotion-map", params: { postSession: "1" } });
    expect(emotionMap).toContain('params.postSession === "1"');
  });

  test("the check-in sends the marker, and JPMR, Reframe and Recovery Plan honour it", () => {
    expect(emotionMap).toContain("returnTo: CHECKIN_RETURN_TO");

    const jpmr = read("app/(auth)/tools/jpmr.tsx");
    expect(jpmr).toContain("isCheckinReturn(params.returnTo)");
    expect(jpmr).toMatch(/returnToCheckin \? \([\s\S]*?router\.replace\(CHECKIN_POST_SESSION_HREF/);

    const reframe = read("app/(auth)/tools/reframe.tsx");
    expect(reframe).toContain("isCheckinReturn(returnTo)");
    expect(reframe).toContain("{ sessionId: activeSession._id, returnTo: CHECKIN_RETURN_TO }");
    expect(reframe).toMatch(/returnToCheckin \? \([\s\S]*?router\.replace\(CHECKIN_POST_SESSION_HREF/);

    const plan = read("app/(auth)/tools/recovery-plan.tsx");
    expect(plan).toContain("isCheckinReturn(returnTo)");
    expect(plan).toMatch(/returnToCheckin && \([\s\S]*?router\.replace\(CHECKIN_POST_SESSION_HREF/);
  });

  test("Think Differently safety mode still exits to Tools, never to the re-check", () => {
    const reframe = read("app/(auth)/tools/reframe.tsx");
    const safety = reframe.slice(reframe.indexOf("Crisis Safety Support"), reframe.indexOf("Gentle Pause"));
    expect(safety).toContain('router.replace("/(auth)/(tabs)/tools")');
    expect(safety).not.toContain("CHECKIN_POST_SESSION_HREF");
  });
});

describe("recommendation card layout adapts to width", () => {
  test("labels sit at full card width and wrap instead of overflowing", () => {
    const card = emotionMap.slice(emotionMap.indexOf("<View style={styles.interventionCard}>"), emotionMap.indexOf("styles.interventionReason}"));
    const headerEnd = card.indexOf("</View>", card.indexOf("styles.interventionTitle"));
    expect(card.indexOf("<View style={styles.badgeRow}>")).toBeGreaterThan(headerEnd);

    const style = (name: string) => emotionMap.slice(emotionMap.indexOf(`  ${name}: {`), emotionMap.indexOf("},", emotionMap.indexOf(`  ${name}: {`)));
    expect(style("badgeRow")).toContain('flexWrap: "wrap"');
    expect(style("pillTag")).toContain('maxWidth: "100%"');
    expect(style("pillTagText")).toContain("flexShrink: 1");
    expect(style("interventionTitle")).toContain("flex: 1");
  });

  test("the Recovery Plan info chips wrap too", () => {
    const plan = read("app/(auth)/tools/recovery-plan.tsx");
    const metaRow = plan.slice(plan.indexOf("  metaRow: {"), plan.indexOf("},", plan.indexOf("  metaRow: {")));
    expect(metaRow).toContain('flexWrap: "wrap"');
  });
});
