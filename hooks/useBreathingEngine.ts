/**
 * Canonical Breathing Engine Hook
 * Priority 9 Step 4B - Single Source of Truth for Breathing Timing and Lifecycle
 *
 * Implements a lifecycle-safe, timestamp-accurate state machine for respiration pacing.
 * Handles background transitions, phase progression, pause/resume, and idempotent completion.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  BreathingPhase,
  BreathingProtocol,
  getCycleDurationSeconds,
} from '@/constants/BreathingProtocols';

export type BreathingSessionState = 'IDLE' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'STOPPED';

export interface BreathingSessionResult {
  protocolId: string;
  protocolName: string;
  startedAt: number;
  completedAt: number;
  durationSeconds: number;
  cyclesCompleted: number;
  targetCycles: number;
  status: 'completed' | 'partial' | 'abandoned';
}

export interface UseBreathingEngineOptions {
  protocol: BreathingProtocol;
  targetCycles?: number;
  targetDurationSeconds?: number;
  onPhaseChange?: (phase: BreathingPhase, cycle: number) => void;
  onComplete?: (result: BreathingSessionResult) => void;
  onStop?: (result: BreathingSessionResult) => void;
  autoStart?: boolean;
}

export interface BreathingEngineOutput {
  state: BreathingSessionState;
  phase: BreathingPhase;
  phaseTimeRemainingSeconds: number;
  phaseElapsedSeconds: number;
  phaseTotalDurationSeconds: number;
  sessionElapsedSeconds: number;
  sessionRemainingSeconds: number;
  sessionTotalDurationSeconds: number;
  completedCycles: number;
  currentCycleIndex: number;
  targetCycles: number;
  overallProgress: number; // 0 to 1
  phaseProgress: number; // 0 to 1
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

export function useBreathingEngine({
  protocol,
  targetCycles: customTargetCycles,
  targetDurationSeconds: customTargetDuration,
  onPhaseChange,
  onComplete,
  onStop,
  autoStart = false,
}: UseBreathingEngineOptions): BreathingEngineOutput {
  const cycleDuration = getCycleDurationSeconds(protocol);

  // Compute targets based on protocol preference
  const targetCycles = customTargetCycles ?? (
    protocol.targetType === 'cycles'
      ? protocol.defaultCycles
      : Math.max(1, Math.ceil((customTargetDuration ?? protocol.defaultDurationSeconds) / Math.max(1, cycleDuration)))
  );

  const targetDurationSeconds = customTargetDuration ?? (
    protocol.targetType === 'duration'
      ? protocol.defaultDurationSeconds
      : targetCycles * cycleDuration
  );

  // Core state
  const [state, setState] = useState<BreathingSessionState>('IDLE');
  const [phase, setPhase] = useState<BreathingPhase>('INHALE');
  const [phaseTimeRemaining, setPhaseTimeRemaining] = useState<number>(protocol.inhaleSeconds);
  const [phaseElapsed, setPhaseElapsed] = useState<number>(0);
  const [sessionElapsed, setSessionElapsed] = useState<number>(0);
  const [completedCycles, setCompletedCycles] = useState<number>(0);

  // Timestamps and references
  const isMountedRef = useRef<boolean>(true);
  const hasFinishedRef = useRef<boolean>(false);
  const sessionStartTimestampRef = useRef<number>(0);
  const phaseStartTimestampRef = useRef<number>(0);
  const pausedTimestampRef = useRef<number>(0);
  const accumulatedPauseTimeRef = useRef<number>(0);
  const phaseAccumulatedPauseRef = useRef<number>(0);
  const currentPhaseRef = useRef<BreathingPhase>('INHALE');
  const completedCyclesRef = useRef<number>(0);
  const timerRef = useRef<any>(null);

  // Keep callback refs fresh
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  const getPhaseDuration = useCallback(
    (p: BreathingPhase): number => {
      switch (p) {
        case 'INHALE':
          return protocol.inhaleSeconds;
        case 'HOLD':
          return protocol.holdSeconds;
        case 'EXHALE':
          return protocol.exhaleSeconds;
        case 'REST':
          return protocol.restSeconds;
      }
    },
    [protocol]
  );

  const getNextPhase = useCallback(
    (current: BreathingPhase): { nextPhase: BreathingPhase; isCycleComplete: boolean } => {
      if (current === 'INHALE') {
        if (protocol.holdSeconds > 0) return { nextPhase: 'HOLD', isCycleComplete: false };
        return { nextPhase: 'EXHALE', isCycleComplete: false };
      }
      if (current === 'HOLD') {
        return { nextPhase: 'EXHALE', isCycleComplete: false };
      }
      if (current === 'EXHALE') {
        if (protocol.restSeconds > 0) return { nextPhase: 'REST', isCycleComplete: false };
        return { nextPhase: 'INHALE', isCycleComplete: true };
      }
      // REST -> INHALE
      return { nextPhase: 'INHALE', isCycleComplete: true };
    },
    [protocol]
  );

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const finalizeSession = useCallback(
    (status: 'completed' | 'partial' | 'abandoned') => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      clearTimer();

      const now = Date.now();
      const rawElapsed = sessionStartTimestampRef.current > 0
        ? Math.floor((now - sessionStartTimestampRef.current - accumulatedPauseTimeRef.current) / 1000)
        : 0;
      const durationSeconds = Math.max(0, Math.min(rawElapsed, targetDurationSeconds));

      const result: BreathingSessionResult = {
        protocolId: protocol.id,
        protocolName: protocol.name,
        startedAt: sessionStartTimestampRef.current || now,
        completedAt: now,
        durationSeconds,
        cyclesCompleted: completedCyclesRef.current,
        targetCycles,
        status,
      };

      if (status === 'completed') {
        setState('COMPLETED');
        onCompleteRef.current?.(result);
      } else {
        setState('STOPPED');
        onStopRef.current?.(result);
      }
    },
    [protocol, targetCycles, targetDurationSeconds]
  );

  // Main tick loop
  const tick = useCallback(() => {
    if (!isMountedRef.current || hasFinishedRef.current) return;

    const now = Date.now();
    const effectivePhaseElapsedMs =
      now - phaseStartTimestampRef.current - phaseAccumulatedPauseRef.current;
    const effectivePhaseElapsedSec = Math.max(0, effectivePhaseElapsedMs / 1000);

    const activePhaseDuration = getPhaseDuration(currentPhaseRef.current);
    const remainingPhaseSec = Math.max(0, activePhaseDuration - effectivePhaseElapsedSec);

    const totalElapsedMs =
      now - sessionStartTimestampRef.current - accumulatedPauseTimeRef.current;
    const totalElapsedSec = Math.max(0, Math.floor(totalElapsedMs / 1000));

    setPhaseElapsed(effectivePhaseElapsedSec);
    setPhaseTimeRemaining(Math.ceil(remainingPhaseSec));
    setSessionElapsed(totalElapsedSec);

    // Check if phase elapsed
    if (effectivePhaseElapsedSec >= activePhaseDuration) {
      const { nextPhase, isCycleComplete } = getNextPhase(currentPhaseRef.current);

      if (isCycleComplete) {
        const nextCycles = completedCyclesRef.current + 1;
        completedCyclesRef.current = nextCycles;
        setCompletedCycles(nextCycles);

        // Completion criteria: reached target cycles OR target duration
        const reachedTargetCycles = nextCycles >= targetCycles;
        const reachedTargetDuration =
          protocol.targetType === 'duration' && totalElapsedSec >= targetDurationSeconds;

        if (reachedTargetCycles || reachedTargetDuration) {
          finalizeSession('completed');
          return;
        }
      }

      // Transition to next phase
      currentPhaseRef.current = nextPhase;
      setPhase(nextPhase);
      phaseStartTimestampRef.current = Date.now();
      phaseAccumulatedPauseRef.current = 0;
      setPhaseTimeRemaining(getPhaseDuration(nextPhase));
      setPhaseElapsed(0);

      onPhaseChangeRef.current?.(nextPhase, completedCyclesRef.current + 1);
    }
  }, [getPhaseDuration, getNextPhase, targetCycles, targetDurationSeconds, protocol.targetType, finalizeSession]);

  const start = useCallback(() => {
    clearTimer();
    hasFinishedRef.current = false;
    const now = Date.now();
    sessionStartTimestampRef.current = now;
    phaseStartTimestampRef.current = now;
    accumulatedPauseTimeRef.current = 0;
    phaseAccumulatedPauseRef.current = 0;

    currentPhaseRef.current = 'INHALE';
    completedCyclesRef.current = 0;

    setPhase('INHALE');
    setPhaseElapsed(0);
    setPhaseTimeRemaining(protocol.inhaleSeconds);
    setSessionElapsed(0);
    setCompletedCycles(0);
    setState('ACTIVE');

    onPhaseChangeRef.current?.('INHALE', 1);

    timerRef.current = setInterval(tick, 100);
  }, [protocol.inhaleSeconds, tick]);

  const pause = useCallback(() => {
    if (state !== 'ACTIVE') return;
    clearTimer();
    pausedTimestampRef.current = Date.now();
    setState('PAUSED');
  }, [state]);

  const resume = useCallback(() => {
    if (state !== 'PAUSED') return;
    const now = Date.now();
    const pausedDurationMs = now - pausedTimestampRef.current;
    accumulatedPauseTimeRef.current += pausedDurationMs;
    phaseAccumulatedPauseRef.current += pausedDurationMs;

    setState('ACTIVE');
    timerRef.current = setInterval(tick, 100);
  }, [state, tick]);

  const stop = useCallback(() => {
    if (state === 'COMPLETED' || state === 'STOPPED' || state === 'IDLE') return;
    clearTimer();

    // Determine if partial or abandoned (under 5 seconds with 0 cycles is considered abandoned)
    const isMeaningful = completedCyclesRef.current >= 1 || sessionElapsed >= 5;
    finalizeSession(isMeaningful ? 'partial' : 'abandoned');
  }, [state, sessionElapsed, finalizeSession]);

  const reset = useCallback(() => {
    clearTimer();
    hasFinishedRef.current = false;
    sessionStartTimestampRef.current = 0;
    phaseStartTimestampRef.current = 0;
    accumulatedPauseTimeRef.current = 0;
    phaseAccumulatedPauseRef.current = 0;
    currentPhaseRef.current = 'INHALE';
    completedCyclesRef.current = 0;

    setState('IDLE');
    setPhase('INHALE');
    setPhaseElapsed(0);
    setPhaseTimeRemaining(protocol.inhaleSeconds);
    setSessionElapsed(0);
    setCompletedCycles(0);
  }, [protocol.inhaleSeconds]);

  // AppState background/foreground interruption listener
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState.match(/inactive|background/)) {
        if (state === 'ACTIVE') {
          pause();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [state, pause]);

  // Autostart effect
  useEffect(() => {
    if (autoStart && state === 'IDLE') {
      start();
    }
  }, [autoStart, state, start]);

  // Teardown on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimer();
    };
  }, []);

  // Progress metrics
  const activePhaseDuration = getPhaseDuration(phase);
  const phaseProgress = activePhaseDuration > 0
    ? Math.min(1, Math.max(0, phaseElapsed / activePhaseDuration))
    : 1;

  const overallProgress = targetDurationSeconds > 0
    ? Math.min(1, Math.max(0, sessionElapsed / targetDurationSeconds))
    : Math.min(1, Math.max(0, completedCycles / targetCycles));

  const sessionRemainingSeconds = Math.max(0, targetDurationSeconds - sessionElapsed);

  return {
    state,
    phase,
    phaseTimeRemainingSeconds: phaseTimeRemaining,
    phaseElapsedSeconds: Math.floor(phaseElapsed),
    phaseTotalDurationSeconds: activePhaseDuration,
    sessionElapsedSeconds: sessionElapsed,
    sessionRemainingSeconds,
    sessionTotalDurationSeconds: targetDurationSeconds,
    completedCycles,
    currentCycleIndex: Math.min(targetCycles, completedCycles + 1),
    targetCycles,
    overallProgress,
    phaseProgress,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
