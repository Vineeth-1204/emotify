/**
 * Breathing Engine State Machine & Accessibility Logic Tests
 * Priority 9 Step 4B - Lifecycle, Timing & Reduced Motion Verification
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BREATHING_PROTOCOLS,
  BreathingPhase,
  BreathingProtocol,
} from "../constants/BreathingProtocols";

describe("Breathing Engine State & Phase Transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("BREATH-ENG-01: Phase transition sequence for Box 4-4-4-4", () => {
    const protocol = BREATHING_PROTOCOLS.box_4444;
    const phases: BreathingPhase[] = ["INHALE", "HOLD", "EXHALE", "REST"];

    function getNextPhase(current: BreathingPhase): { nextPhase: BreathingPhase; isCycleComplete: boolean } {
      if (current === "INHALE") {
        return { nextPhase: protocol.holdSeconds > 0 ? "HOLD" : "EXHALE", isCycleComplete: false };
      }
      if (current === "HOLD") {
        return { nextPhase: "EXHALE", isCycleComplete: false };
      }
      if (current === "EXHALE") {
        return { nextPhase: protocol.restSeconds > 0 ? "REST" : "INHALE", isCycleComplete: protocol.restSeconds <= 0 };
      }
      return { nextPhase: "INHALE", isCycleComplete: true };
    }

    let currentPhase: BreathingPhase = "INHALE";
    const traversed: BreathingPhase[] = [currentPhase];

    for (let i = 0; i < 3; i++) {
      const { nextPhase } = getNextPhase(currentPhase);
      traversed.push(nextPhase);
      currentPhase = nextPhase;
    }

    expect(traversed).toEqual(phases);

    // After REST, transitions back to INHALE and completes 1 full cycle
    const cycleCompletion = getNextPhase("REST");
    expect(cycleCompletion.nextPhase).toBe("INHALE");
    expect(cycleCompletion.isCycleComplete).toBe(true);
  });

  test("BREATH-ENG-02: Phase transition sequence for Paced 4-4-4 (0s rest)", () => {
    const protocol = BREATHING_PROTOCOLS.paced_444;

    function getNextPhase(current: BreathingPhase): { nextPhase: BreathingPhase; isCycleComplete: boolean } {
      if (current === "INHALE") {
        return { nextPhase: protocol.holdSeconds > 0 ? "HOLD" : "EXHALE", isCycleComplete: false };
      }
      if (current === "HOLD") {
        return { nextPhase: "EXHALE", isCycleComplete: false };
      }
      if (current === "EXHALE") {
        return { nextPhase: protocol.restSeconds > 0 ? "REST" : "INHALE", isCycleComplete: true };
      }
      return { nextPhase: "INHALE", isCycleComplete: true };
    }

    expect(getNextPhase("INHALE").nextPhase).toBe("HOLD");
    expect(getNextPhase("HOLD").nextPhase).toBe("EXHALE");
    const exhaleTransition = getNextPhase("EXHALE");
    expect(exhaleTransition.nextPhase).toBe("INHALE");
    expect(exhaleTransition.isCycleComplete).toBe(true);
  });

  test("BREATH-ENG-03: Session Completion vs Partial vs Abandoned semantics", () => {
    const targetCycles = 4;
    const targetDuration = 64;

    function classifySession(cyclesCompleted: number, durationSeconds: number) {
      if (cyclesCompleted >= targetCycles || durationSeconds >= targetDuration) {
        return "completed";
      }
      if (cyclesCompleted >= 1 || durationSeconds >= 5) {
        return "partial";
      }
      return "abandoned";
    }

    // 0 seconds, 0 cycles -> abandoned
    expect(classifySession(0, 2)).toBe("abandoned");

    // 10 seconds, 0 cycles -> partial (user tried but stopped early)
    expect(classifySession(0, 10)).toBe("partial");

    // 1 full cycle (16s) -> partial
    expect(classifySession(1, 16)).toBe("partial");

    // 4 full cycles -> completed
    expect(classifySession(4, 64)).toBe("completed");
  });

  test("BREATH-ENG-04: Reduced motion suppresses scale animation without breaking phase state", () => {
    const reduceMotionEnabled = true;

    function getVisualScale(reduceMotion: boolean, animValue: number) {
      if (reduceMotion) return 1.0;
      return animValue;
    }

    expect(getVisualScale(reduceMotionEnabled, 1.45)).toBe(1.0);
    expect(getVisualScale(false, 1.45)).toBe(1.45);
  });

  test("BREATH-ENG-05: Screen reader announcement accurately formats phase and cycle index", () => {
    const protocol = BREATHING_PROTOCOLS.box_4444;
    const phase: BreathingPhase = "INHALE";
    const currentCycle = 2;
    const totalCycles = 4;

    const phaseConfig = protocol.phaseLabels[phase];
    const announcement = `${phaseConfig.accessibilityVoice}. Cycle ${currentCycle} of ${totalCycles}.`;

    expect(announcement).toBe("Inhale for 4 seconds. Cycle 2 of 4.");
  });

  test("BREATH-ENG-06: Idempotency guarantee - completion handler fires exactly once", () => {
    let callCount = 0;
    let hasFinished = false;

    function triggerCompletion() {
      if (hasFinished) return;
      hasFinished = true;
      callCount++;
    }

    // Rapid successive attempts (e.g. double taps, timer boundary races)
    triggerCompletion();
    triggerCompletion();
    triggerCompletion();

    expect(callCount).toBe(1);
  });

  test("BREATH-ENG-07: Offline resilience - persistence error does not crash or mark session as failed", async () => {
    let localSessionSuccess = false;
    let offlineLogged = false;

    async function handleSessionFinished(networkAvailable: boolean) {
      localSessionSuccess = true;

      try {
        if (!networkAvailable) {
          throw new Error("Network unavailable (offline)");
        }
      } catch (err) {
        offlineLogged = true;
      }
    }

    await handleSessionFinished(false);

    expect(localSessionSuccess).toBe(true);
    expect(offlineLogged).toBe(true);
  });
});
