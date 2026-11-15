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
}

export type StartResult = { started: true } | { started: false; issue: DictationIssue; downloadLocale?: string; ignored?: false } | { started: false; ignored: true };

export class DictationController {
  private status: DictationStatus = "idle";
  private session: Session | null = null;
  /** True from start() until the recognizer reports "end": no new session may start meanwhile. */
  private nativeActive = false;
  private nativeReleasedAt = 0;
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: DictationSnapshot) => void>();

  constructor(
    private readonly getModule: () => SpeechModuleLike | null,
    private readonly env: DictationEnv
  ) {}

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
      const choice = chooseOnDeviceLocale(appLanguage, await mod.getSupportedLocales({}));
      if (!choice.ok) return choice.issue === "model_not_installed" ? { ok: false, issue: choice.issue, downloadLocale: choice.downloadLocale } : { ok: false, issue: choice.issue };
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
    this.session = { target, base: baseText, onText, finals: [], partial: "", lastEmitted: baseText, emitted: [baseText] };
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
      this.nativeActive = true;
      mod.start({
        lang: available.locale,
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: true,
        addsPunctuation: false,
        recordingOptions: { persist: false },
      });
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

  handleError(_event: { error: string }): void {
    // "end" always follows an error; the session closes there. Partial text already shown stays.
  }

  handleEnd(): void {
    this.nativeActive = false;
    this.nativeReleasedAt = 0;
    if (this.session) {
      this.clearTimer();
      this.finish();
    }
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
    this.session = null;
    this.setStatus("idle");
  }

  private clearTimer() {
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionTimer = null;
  }
}
