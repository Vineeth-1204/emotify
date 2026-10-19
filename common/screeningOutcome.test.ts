import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  ACTION_LABEL_KEYS,
  counsellorLabelKey,
  outcomeForTriageLevel,
  resultScreenState,
  screeningOutcomeView,
  type ScreeningOutcome,
} from "./screeningOutcome";
import { getEmotyPresence } from "./emotyPresence";

const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../i18n/locales/en.json"), "utf-8"));
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf-8");
const resultScreen = read("app/(auth)/screening-result.tsx");
const screeningScreen = read("app/(auth)/screening.tsx");
const tabsLayout = read("app/(auth)/(tabs)/_layout.tsx");
const lookup = (key: string) => key.split(".").reduce((o: any, k) => o?.[k], en);

const OUTCOMES: ScreeningOutcome[] = ["steady", "support", "priority_support", "immediate_safety"];
const online = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 };
const offline = { isWebSocketConnected: false, hasEverConnected: true, connectionRetries: 2 };
const APPROVED_CRISIS_SENTENCE = "We're concerned for your safety. If you're in danger now, please call emergency services immediately.";

/** Words that would label, diagnose, score or alarm the student. */
const FORBIDDEN = /depress|anxiety disorder|psychos|disorder|diagnos|severe|suicid|risk|score|symptom|result shows|failed|fault|abnormal|warning|alarm/i;

describe("triage level to student outcome (presentation only)", () => {
  test("each existing triage level maps to one outcome; no level is downgraded", () => {
    expect(outcomeForTriageLevel("mild")).toBe("steady");
    expect(outcomeForTriageLevel("moderate")).toBe("support");
    expect(outcomeForTriageLevel("severe")).toBe("priority_support");
    expect(outcomeForTriageLevel("psychosis_flag")).toBe("priority_support");
    expect(outcomeForTriageLevel("suicide_flag")).toBe("immediate_safety");
  });

  test("missing results are not an outcome; unknown levels never read as the low-concern message", () => {
    expect(outcomeForTriageLevel(undefined)).toBeNull();
    expect(outcomeForTriageLevel(null)).toBeNull();
    expect(outcomeForTriageLevel("")).toBeNull();
    expect(outcomeForTriageLevel("force_retest")).toBe("support");
    expect(outcomeForTriageLevel("some_future_level")).toBe("support");
  });
});

describe("calm, non-diagnostic copy", () => {
  test("every outcome has a heading and body in English, with no diagnostic, score or alarming words", () => {
    for (const o of OUTCOMES) {
      const view = screeningOutcomeView(o);
      const heading = lookup(view.headingKey);
      expect(heading, o).toBeTruthy();
      for (const key of view.bodyKeys) expect(lookup(key), key).toBeTruthy();
      const text = [heading, ...view.bodyKeys.map(lookup)].join(" ").replace(APPROVED_CRISIS_SENTENCE, "");
      expect(text, o).not.toMatch(FORBIDDEN);
    }
    for (const key of Object.values(ACTION_LABEL_KEYS)) expect(lookup(key), key).toBeTruthy();
    expect(JSON.stringify(en.screening.result).replace(APPROVED_CRISIS_SENTENCE, "")).not.toMatch(FORBIDDEN);
  });

  test("the agreed wording for support and priority outcomes", () => {
    expect(en.screening.result.support.heading).toBe("You deserve support, too.");
    expect(en.screening.result.support.body).toContain("You don't have to figure everything out on your own.");
    expect(en.screening.result.prioritySupport.heading).toBe("You don't have to handle this alone.");
    expect(en.screening.result.prioritySupport.body).toContain("Speaking with a counsellor soon could help");
    expect(lookup(counsellorLabelKey("support"))).toBe("Talk to a counsellor");
    expect(lookup(counsellorLabelKey("priority_support"))).toBe("Connect with a counsellor");
    expect(lookup(ACTION_LABEL_KEYS.tools)).toBe("Explore support options");
  });

  test("the low-concern message does not claim the student is fine or safe", () => {
    expect(en.screening.result.steady.body).not.toMatch(/you('| a)re (fine|ok|okay|safe|healthy)|nothing to worry|no problems/i);
    expect(en.screening.result.steady.body).toMatch(/reach out/);
  });
});

describe("next steps per outcome", () => {
  test("support and priority outcomes lead with a counsellor; low concern leads home but still offers one", () => {
    expect(screeningOutcomeView("support")).toMatchObject({ primary: "counsellor", secondary: ["tools", "home"], showSafetyFooter: true });
    expect(screeningOutcomeView("priority_support")).toMatchObject({ primary: "counsellor", secondary: ["tools", "home"], showSafetyFooter: true });
    expect(screeningOutcomeView("steady")).toMatchObject({ primary: "home", secondary: ["tools", "counsellor"], showSafetyFooter: true });
  });

  test("immediate safety keeps the approved crisis guidance and crisis actions first, not a wellness activity", () => {
    const view = screeningOutcomeView("immediate_safety");
    expect(view.primary).toBe("call_emergency");
    expect(view.secondary).toEqual(["call_helpline", "more_support"]);
    expect([view.primary, ...view.secondary]).not.toContain("tools");
    expect(lookup(view.bodyKeys[0])).toBe(APPROVED_CRISIS_SENTENCE);
    // The same approved sentence remains on the existing emergency screen
    expect(tabsLayout).toContain(APPROVED_CRISIS_SENTENCE);
  });

  test("Emoty stays calm: no celebrating after any result, and no spoken line over the result card", () => {
    for (const o of OUTCOMES) {
      const presence = getEmotyPresence({ scene: "screening_result", outcome: o });
      expect(presence.mood, o).not.toBe("celebrating");
      expect(presence.line).toBeNull();
    }
    expect(getEmotyPresence({ scene: "screening_result", outcome: "immediate_safety" }).avatarState).toBe("supportive");
  });
});

describe("results screen states never misrepresent a missing result", () => {
  test("loading, offline and missing are distinct from any outcome", () => {
    expect(resultScreenState(undefined, online)).toEqual({ kind: "loading" });
    expect(resultScreenState(undefined, { isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 0 })).toEqual({ kind: "loading" });
    expect(resultScreenState(undefined, offline)).toEqual({ kind: "offline" });
    expect(resultScreenState({ status: "none" }, online)).toEqual({ kind: "missing" });
    expect(resultScreenState({ status: "unauthenticated" }, online)).toEqual({ kind: "missing" });
    const ready = resultScreenState({ status: "ready", outcome: "support", completedAt: 1 }, offline);
    expect(ready).toMatchObject({ kind: "ready", view: { outcome: "support" } });
  });
});

describe("screen wiring", () => {
  test("the results screen only reads the student's own summary; it writes nothing", () => {
    expect(resultScreen).toContain("useQuery(api.screening.getMyResultSummary, {})");
    expect(resultScreen).not.toMatch(/useMutation|useAction|submitScreeningAttempt|createAlert|counsellorRequests/);
    expect(resultScreen).toContain("resultScreenState(summary, connection)");
    expect(resultScreen).toContain("class ResultErrorBoundary");
    const code = resultScreen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/phq9|gad7|pq16|triage|severity|score/i);
    // Calm base palette: no error/danger colours or alarming variants
    expect(resultScreen).not.toMatch(/Colors\.error|variant="danger"|#DC2626|#EF4444/);
  });

  test("submission: one guarded mutation call, results only after success, answers kept on failure", () => {
    expect(screeningScreen.match(/await submitScreeningAttempt\(/g)).toHaveLength(1);
    expect(screeningScreen).toMatch(/if \(!user \|\| submittingRef\.current\) return;\s*submittingRef\.current = true;/);
    const afterSubmit = screeningScreen.slice(screeningScreen.indexOf("await submitScreeningAttempt("));
    expect(afterSubmit.indexOf("SecureStore.deleteItemAsync")).toBeLessThan(afterSubmit.indexOf('router.replace("/(auth)/screening-result"'));
    const failure = screeningScreen.slice(screeningScreen.indexOf("} catch (error) {", screeningScreen.indexOf("await submitScreeningAttempt(")));
    expect(failure).toMatch(/submittingRef\.current = false;\s*setIsSubmitting\(false\);\s*setSubmitError\(true\);/);
    expect(screeningScreen).toContain('t("screening.submit.error")');
    expect(screeningScreen).toContain('t("screening.submit.waiting")');
  });

  test("the existing emergency screen keeps every action and the dismissal record, in a calmer style", () => {
    for (const s of ["EMERGENCY_DIAL_URL", "HELPLINE_DIAL_URL", "emergencyContactPhone", "Talk to Counsellor Now", "recordEmergencyDismissal", 'latestTriage?.level === "suicide_flag"']) {
      expect(tabsLayout, s).toContain(s);
    }
    expect(tabsLayout).not.toContain(">Safety Priority<");
    expect(tabsLayout).not.toMatch(/emergencyTitle, \{ color: safetyColors\.error/);
  });
});
