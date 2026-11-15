/**
 * Voice-to-text dictation for free-text inputs.
 *
 * Privacy rules (enforced here, not by the screens):
 * - Recognition runs only on-device. Where on-device recognition cannot be guaranteed for the
 *   student's language, dictation does not start and the student keeps the keyboard.
 * - No audio is recorded or stored (recordingOptions.persist is false) and nothing is sent to
 *   the backend; only the recognised words are placed in the input.
 * - Dictated text is appended to what the student already typed, never replaces it, and is never
 *   submitted automatically or rewritten.
 *
 * Platform policy (see expo-speech-recognition 3.1.x):
 * - Android 13+ (API 33): `requiresOnDeviceRecognition` uses SpeechRecognizer.createOnDevice...,
 *   so audio cannot leave the phone. Allowed when the language's on-device model is installed.
 * - Android 12 and below: the library only *prefers* offline recognition, so it may go online.
 * - iOS: the library silently falls back to server recognition when the chosen locale has no
 *   on-device model, and per-locale support cannot be checked from JS.
 * - Web: browser recognition is server-based.
 * The last three are refused with an explanation.
 *
 * One controller is shared by the whole app, so only one recognition session can exist at a time.
 */

export type DictationStatus = "idle" | "starting" | "listening" | "stopping";

export type DictationIssue =
  | "platform_unsupported"
  | "android_too_old"
  | "needs_app_update"
  | "service_unavailable"
  | "on_device_unavailable"
  | "language_unavailable"
  | "model_not_installed"
  | "permission_denied"
  | "permission_blocked"
  | "build_missing_microphone"
  | "no_speech"
  | "mic_in_use"
  | "recognition_failed"
  | "failed";

/** The parts of ExpoSpeechRecognitionModule this feature uses. */
export interface SpeechModuleLike {
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  getSupportedLocales(options: Record<string, never>): Promise<{ locales: string[]; installedLocales: string[] }>;
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  androidTriggerOfflineModelDownload?(options: { locale: string }): Promise<{ status: string }>;
}

export interface DictationEnv {
  platform: string; // Platform.OS
  androidApiLevel: number | null; // Platform.Version on Android, else null
}

/** App languages (LanguageContext codes) mapped to the requested recognition locales. */
export const DICTATION_LOCALES: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
};

/** Longest single session; stops automatically so the microphone is never left on. */
export const MAX_SESSION_MS = 2 * 60 * 1000;
/** If the recognizer never reports "end" after a stop/abort, stop waiting for it after this long. */
const END_GRACE_MS = 3000;
/** A language check stays valid this long, so a tap doesn't probe the recognizer every time. */
const AVAILABILITY_TTL_MS = 10 * 60 * 1000;
/**
 * The locale probe (getSupportedLocales) binds its own on-device recognizer; starting another
 * immediately can fail with "busy"/"client". Wait this long after a fresh probe.
 */
const PROBE_SETTLE_MS = 400;
/** A transient recognizer error this soon after starting is retried once. */
const RETRY_WINDOW_MS = 3000;
const RETRY_DELAY_MS = 600;
const TRANSIENT_ERRORS = new Set(["busy", "client", "too-many-requests", "unknown"]);

/**
 * Recognition settings. Not continuous: in continuous mode the library records the microphone
 * itself and streams it to the recognizer (EXTRA_AUDIO_SOURCE + segmented session), which some
 * phones' on-device recognizers reject at once. In this mode the recognizer captures the
 * microphone itself; a session ends after a pause and the next tap appends more text.
 */
export function recognitionOptions(locale: string) {
  return {
    lang: locale,
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
    requiresOnDeviceRecognition: true,
    addsPunctuation: false,
    recordingOptions: { persist: false },
    androidIntentOptions: {
      // Give students time to think between phrases (not every recognizer honours these).
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
    },
  };
}

/** What a recognizer error means for the student. Returns null when nothing needs saying. */
export function issueForRecognizerError(code: string, gotSpeech: boolean): DictationIssue | null {
  switch (code) {
    case "aborted":
      return null;
    case "no-speech":
    case "speech-timeout":
      return gotSpeech ? null : "no_speech";
    case "not-allowed":
      return "permission_blocked";
    case "language-not-supported":
      return "model_not_installed";
    case "audio-capture":
      return "mic_in_use";
    default:
      return "recognition_failed";
  }
}

export interface DictationProblem {
  target: string;
  issue: DictationIssue;
  /** Recognizer error code, for diagnosis (e.g. "client", "busy"). */
  code?: string;
  downloadLocale?: string;
}

const normalize = (locale: string) => locale.replace(/_/g, "-").toLowerCase();
const languageOf = (locale: string) => normalize(locale).split("-")[0];

export type LocaleChoice =
  | { ok: true; locale: string }
  | { ok: false; issue: "language_unavailable" }
  | { ok: false; issue: "model_not_installed"; downloadLocale: string };

/**
 * Picks the on-device locale for the student's app language: the requested locale if its model
 * is installed, otherwise an installed locale of the same language (e.g. en-US for English).
 * If the language is supported but no model is installed, the student can download one.
 */
export function chooseOnDeviceLocale(
  appLanguage: string,
  supported: { locales: string[]; installedLocales: string[] }
): LocaleChoice {
  const wanted = DICTATION_LOCALES[appLanguage] ?? DICTATION_LOCALES.en;
  const pick = (list: string[]) =>
    list.find((l) => normalize(l) === normalize(wanted)) ?? list.find((l) => languageOf(l) === languageOf(wanted));
  const installed = pick(supported.installedLocales);
  if (installed) return { ok: true, locale: installed };
  const downloadable = pick(supported.locales);
  if (downloadable) return { ok: false, issue: "model_not_installed", downloadLocale: downloadable };
  return { ok: false, issue: "language_unavailable" };
}

/**
 * Android refuses a permission the installed build never declared exactly like a permanent
 * "don't ask again": denied, cannot ask again, no dialog. A real permanent denial needs earlier
 * requests, so a "blocked" answer to this install's very first request means the build is
 * missing the microphone permission (it was built without the speech config plugin).
 */
export function resolvePermissionIssue(issue: DictationIssue, askedBefore: boolean): DictationIssue {
  return issue === "permission_blocked" && !askedBefore ? "build_missing_microphone" : issue;
}

/** Appends dictated words to existing text. Empty speech never changes the text. */
export function appendDictation(existing: string, spoken: string): string {
  const words = spoken.trim();
  if (!words) return existing;
  if (!existing.trim()) return words;
  return /\s$/.test(existing) ? existing + words : `${existing} ${words}`;
}

export interface DictationSnapshot {
  status: DictationStatus;
  /** "<owner>:<field>" of the input receiving text, or null. */
  target: string | null;
}

interface Session {
  target: string;
  base: string;
  onText: (text: string) => void;
  finals: string[];
  partial: string;
  lastEmitted: string;
  /** Recent texts this session put into the input; renders can lag behind fast results. */
  emitted: string[];
  locale?: string;
  appLanguage: string;
  startedAt: number;
  gotSpeech: boolean;
  error?: { code: string; message?: string };
  retried: boolean;
}

export type StartResult = { started: true } | { started: false; issue: DictationIssue; downloadLocale?: string; ignored?: false } | { started: false; ignored: true };

export class DictationController {
  private status: DictationStatus = "idle";
  private session: Session | null = null;
  /** True from start() until the recognizer reports "end": no new session may start meanwhile. */
  private nativeActive = false;
  private nativeReleasedAt = 0;
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: DictationSnapshot) => void>();
  private problemListeners = new Set<(p: DictationProblem) => void>();
  private availabilityCache = new Map<string, { locale: string; at: number }>();
  private readonly settleMs: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly getModule: () => SpeechModuleLike | null,
    private readonly env: DictationEnv,
    timing: { settleMs?: number; retryDelayMs?: number } = {}
  ) {
    this.settleMs = timing.settleMs ?? PROBE_SETTLE_MS;
    this.retryDelayMs = timing.retryDelayMs ?? RETRY_DELAY_MS;
  }

  /** Problems that end a session after it started (the screen explains them). */
  onProblem(listener: (p: DictationProblem) => void): () => void {
    this.problemListeners.add(listener);
    return () => this.problemListeners.delete(listener);
  }

  snapshot(): DictationSnapshot {
    return { status: this.status, target: this.session?.target ?? null };
  }

  subscribe(listener: (s: DictationSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: DictationStatus) {
    this.status = status;
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  /**
   * Whether an input's current value is text this session produced. `false` means the student
   * edited the field (or it was cleared/sent) while listening; `null` means no session for it.
   */
  isOwnText(target: string, value: string): boolean | null {
    if (this.session?.target !== target) return null;
    return this.session.emitted.includes(value);
  }

  /** Checks everything that can be checked without the microphone. */
  async checkAvailability(appLanguage: string): Promise<{ ok: true; locale: string } | { ok: false; issue: DictationIssue; downloadLocale?: string }> {
    if (this.env.platform !== "android") return { ok: false, issue: "platform_unsupported" };
    if ((this.env.androidApiLevel ?? 0) < 33) return { ok: false, issue: "android_too_old" };
    const mod = this.getModule();
    if (!mod) return { ok: false, issue: "needs_app_update" };
    try {
      if (!mod.isRecognitionAvailable()) return { ok: false, issue: "service_unavailable" };
      if (!mod.supportsOnDeviceRecognition()) return { ok: false, issue: "on_device_unavailable" };
      const cached = this.availabilityCache.get(appLanguage);
      if (cached && Date.now() - cached.at < AVAILABILITY_TTL_MS) return { ok: true, locale: cached.locale };
      const choice = chooseOnDeviceLocale(appLanguage, await mod.getSupportedLocales({}));
      if (!choice.ok) return choice.issue === "model_not_installed" ? { ok: false, issue: choice.issue, downloadLocale: choice.downloadLocale } : { ok: false, issue: choice.issue };
      this.availabilityCache.set(appLanguage, { locale: choice.locale, at: Date.now() });
      if (this.settleMs > 0) await new Promise((r) => setTimeout(r, this.settleMs));
      return { ok: true, locale: choice.locale };
    } catch {
      return { ok: false, issue: "service_unavailable" };
    }
  }

  /**
   * Starts dictation into one input. Ignored (no second session) while any session is starting,
   * running or still shutting down.
   */
  async start(target: string, baseText: string, onText: (text: string) => void, appLanguage: string): Promise<StartResult> {
    if (this.status !== "idle" || this.isNativeBusy()) return { started: false, ignored: true };
    this.session = {
      target,
      base: baseText,
      onText,
      finals: [],
      partial: "",
      lastEmitted: baseText,
      emitted: [baseText],
      appLanguage,
      startedAt: Date.now(),
      gotSpeech: false,
      retried: false,
    };
    this.setStatus("starting");

    const fail = (issue: DictationIssue, downloadLocale?: string): StartResult => {
      this.session = null;
      this.setStatus("idle");
      return { started: false, issue, downloadLocale };
    };

    const available = await this.checkAvailability(appLanguage);
    if (!available.ok) return fail(available.issue, available.downloadLocale);
    if (this.session?.target !== target) return { started: false, ignored: true }; // cancelled meanwhile

    const mod = this.getModule()!;
    let permission: { granted: boolean; canAskAgain: boolean };
    try {
      permission = await mod.requestPermissionsAsync();
    } catch {
      return fail("failed");
    }
    if (!permission.granted) return fail(permission.canAskAgain ? "permission_denied" : "permission_blocked");
    if (this.session?.target !== target) return { started: false, ignored: true };

    try {
      this.session.locale = available.locale;
      this.session.startedAt = Date.now();
      this.nativeActive = true;
      mod.start(recognitionOptions(available.locale));
    } catch {
      this.nativeActive = false;
      return fail("failed");
    }
    this.setStatus("listening");
    this.sessionTimer = setTimeout(() => this.stop(), MAX_SESSION_MS);
    return { started: true };
  }

  /** Stops listening; a pending final result is still added. */
  stop(): void {
    if (!this.session || this.status === "idle" || this.status === "stopping") return;
    this.clearTimer();
    if (this.nativeActive) {
      this.setStatus("stopping");
      this.getModule()?.stop();
    } else {
      this.finish();
    }
  }

  /** Stops immediately and discards anything not yet added (navigation, typing, send). */
  abort(target?: string): void {
    if (!this.session || (target && this.session.target !== target)) return;
    this.clearTimer();
    if (this.nativeActive) {
      this.getModule()?.abort();
      this.nativeReleasedAt = Date.now();
    }
    this.finish();
  }

  /** Aborts if the session belongs to the given owner (a screen that is closing). */
  abortOwner(owner: string): void {
    if (this.session?.target.startsWith(`${owner}:`)) this.abort();
  }

  // ----- native events --------------------------------------------------------------------

  handleResult(event: { isFinal: boolean; results: Array<{ transcript: string }> }): void {
    const s = this.session;
    if (!s || this.status === "idle") return;
    const transcript = (event.results?.[0]?.transcript ?? "").trim();
    if (transcript) s.gotSpeech = true;
    if (event.isFinal) {
      if (transcript) s.finals.push(transcript);
      s.partial = "";
    } else {
      s.partial = transcript;
    }
    const spoken = [...s.finals, s.partial].filter(Boolean).join(" ");
    const text = appendDictation(s.base, spoken);
    if (text !== s.lastEmitted) {
      s.lastEmitted = text;
      // The starting text stops counting as ours once words are added: returning to it means
      // the student cleared or sent the message, which must stop dictation.
      s.emitted = s.emitted.length === 1 && s.emitted[0] === s.base ? [text] : [...s.emitted.slice(-19), text];
      s.onText(text);
    }
  }

  handleError(event: { error: string; message?: string }): void {
    // "end" always follows an error; the session closes (or retries) there.
    if (this.session) this.session.error = { code: event.error, message: event.message };
  }

  handleEnd(): void {
    this.nativeActive = false;
    this.nativeReleasedAt = 0;
    const s = this.session;
    if (!s) return;
    const error = s.error;
    s.error = undefined;

    // A transient failure right after starting (recognizer still busy) is retried once.
    if (error && TRANSIENT_ERRORS.has(error.code) && !s.retried && !s.gotSpeech && s.locale && Date.now() - s.startedAt < RETRY_WINDOW_MS && this.status === "listening") {
      s.retried = true;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.session !== s || this.status !== "listening") return;
        try {
          this.nativeActive = true;
          s.startedAt = Date.now();
          this.getModule()?.start(recognitionOptions(s.locale!));
        } catch {
          this.nativeActive = false;
          this.report(s, "recognition_failed", error.code);
          this.clearTimer();
          this.finish();
        }
      }, this.retryDelayMs);
      return;
    }

    this.clearTimer();
    if (error) {
      const issue = issueForRecognizerError(error.code, s.gotSpeech);
      if (issue === "model_not_installed") this.availabilityCache.delete(s.appLanguage);
      if (issue) this.report(s, issue, error.code, issue === "model_not_installed" ? s.locale : undefined);
    } else if (!s.gotSpeech && this.status === "listening") {
      // Ended by itself with nothing heard (no error from the recognizer).
      this.report(s, "no_speech");
    }
    this.finish();
  }

  private report(s: Session, issue: DictationIssue, code?: string, downloadLocale?: string) {
    const problem: DictationProblem = { target: s.target, issue, code, downloadLocale };
    this.problemListeners.forEach((l) => l(problem));
  }

  private isNativeBusy(): boolean {
    if (!this.nativeActive) return false;
    if (this.nativeReleasedAt && Date.now() - this.nativeReleasedAt > END_GRACE_MS) {
      this.nativeActive = false;
      return false;
    }
    return true;
  }

  private finish() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.session = null;
    this.setStatus("idle");
  }

  private clearTimer() {
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionTimer = null;
  }
}
