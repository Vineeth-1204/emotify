import { afterEach, describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import { DictationController, appendDictation, chooseOnDeviceLocale, issueForRecognizerError, resolvePermissionIssue, MAX_SESSION_MS, type DictationProblem, type SpeechModuleLike } from "./dictation";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf-8");

/** A stand-in for ExpoSpeechRecognitionModule on an Android 13+ phone with on-device models. */
function fakeModule(overrides: Partial<SpeechModuleLike> = {}, installed = ["en-IN", "hi-IN", "ta-IN", "te-IN"]) {
  const calls: any[] = [];
  const mod: SpeechModuleLike = {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    getSupportedLocales: async () => ({ locales: [...installed, "en-US"], installedLocales: installed }),
    requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    start: (o) => calls.push(["start", o]),
    stop: () => calls.push(["stop"]),
    abort: () => calls.push(["abort"]),
    ...overrides,
  };
  return { mod, calls };
}

const android = { platform: "android", androidApiLevel: 34 };

function setup(overrides: Partial<SpeechModuleLike> = {}, env = android, installed?: string[]) {
  const { mod, calls } = fakeModule(overrides, installed);
  (mod as any).probes = 0;
  const probe = mod.getSupportedLocales;
  mod.getSupportedLocales = async (o) => {
    (mod as any).probes++;
    return probe(o);
  };
  const c = new DictationController(() => mod, env, { settleMs: 0, retryDelayMs: 0 });
  const field = { value: "" };
  const onText = (t: string) => (field.value = t);
  const problems: DictationProblem[] = [];
  c.onProblem((p) => problems.push(p));
  return { c, calls, field, onText, problems, mod };
}

const result = (transcript: string, isFinal = false) => ({ isFinal, results: [{ transcript }] });

afterEach(() => vi.useRealTimers());

describe("text handling", () => {
  test("dictation is appended to what the student typed; empty speech changes nothing", () => {
    expect(appendDictation("I felt", "really tired")).toBe("I felt really tired");
    expect(appendDictation("I felt ", "tired")).toBe("I felt tired");
    expect(appendDictation("", "  hello ")).toBe("hello");
    expect(appendDictation("typed text", "   ")).toBe("typed text");
  });

  test("partial results replace each other; final segments accumulate without duplication", async () => {
    const { c, field, onText } = setup();
    field.value = "Before:";
    await c.start("s:f", field.value, onText, "en");
    c.handleResult(result("I"));
    c.handleResult(result("I was"));
    c.handleResult(result("I was worried", true));
    expect(field.value).toBe("Before: I was worried");
    c.handleResult(result("about"));
    c.handleResult(result("about exams", true));
    expect(field.value).toBe("Before: I was worried about exams");
    c.handleResult(result("", true)); // empty final: nothing changes
    expect(field.value).toBe("Before: I was worried about exams");
  });

  test("no speech at all leaves the existing text exactly as it was", async () => {
    const { c, field, onText } = setup();
    field.value = "my own words";
    await c.start("s:f", field.value, onText, "en");
    c.handleResult(result(""));
    c.handleEnd();
    expect(field.value).toBe("my own words");
  });

  test("the student's own edits are recognised (so the screen can let the keyboard win)", async () => {
    const { c, field, onText } = setup();
    await c.start("s:f", "", onText, "en");
    c.handleResult(result("hello"));
    c.handleResult(result("hello there"));
    expect(c.isOwnText("s:f", "hello")).toBe(true); // a lagging render of earlier dictation
    expect(c.isOwnText("s:f", field.value)).toBe(true);
    expect(c.isOwnText("s:f", "hello there!")).toBe(false); // typed by the student
    expect(c.isOwnText("s:f", "")).toBe(false); // cleared or sent
    expect(c.isOwnText("other:f", "x")).toBeNull();
  });
});

describe("sessions", () => {
  test("starts on-device only, with interim results and no audio persistence", async () => {
    const { c, calls, onText } = setup();
    expect(await c.start("s:f", "", onText, "ta")).toEqual({ started: true });
    const [, options] = calls.find((x) => x[0] === "start");
    expect(options).toMatchObject({ lang: "ta-IN", requiresOnDeviceRecognition: true, interimResults: true, recordingOptions: { persist: false } });
    expect(c.snapshot()).toEqual({ status: "listening", target: "s:f" });
  });

  test("repeated taps never create a second session", async () => {
    const { c, calls, onText } = setup();
    const [a, b] = await Promise.all([c.start("s:f", "", onText, "en"), c.start("s:g", "", onText, "en")]);
    expect([a, b]).toEqual([{ started: true }, { started: false, ignored: true }]);
    expect(calls.filter((x) => x[0] === "start")).toHaveLength(1);
    c.stop();
    expect(c.snapshot().status).toBe("stopping");
    expect((await c.start("s:f", "", onText, "en")).started).toBe(false); // still shutting down
    c.handleEnd();
    expect((await c.start("s:f", "", onText, "en")).started).toBe(true);
  });

  test("stop keeps the final result; abort discards anything that arrives later", async () => {
    const { c, field, onText } = setup();
    await c.start("s:f", "", onText, "en");
    c.stop();
    c.handleResult(result("kept", true));
    c.handleEnd();
    expect(field.value).toBe("kept");

    await c.start("s:f", field.value, onText, "en");
    c.abort("s:f");
    expect(c.snapshot()).toEqual({ status: "idle", target: null });
    c.handleResult(result("late words", true));
    expect(field.value).toBe("kept");
  });

  test("leaving the screen stops only that screen's session", async () => {
    const { c, calls, onText } = setup();
    await c.start("screenA:f", "", onText, "en");
    c.abortOwner("screenB");
    expect(c.snapshot().status).toBe("listening");
    c.abortOwner("screenA");
    expect(c.snapshot().status).toBe("idle");
    expect(calls.some((x) => x[0] === "abort")).toBe(true);
  });

  test("a session stops by itself after the maximum time", async () => {
    vi.useFakeTimers();
    const { c, calls, onText } = setup();
    await c.start("s:f", "", onText, "en");
    vi.advanceTimersByTime(MAX_SESSION_MS + 1);
    expect(calls.some((x) => x[0] === "stop")).toBe(true);
  });

  test("an error ends the session cleanly and keeps text already added", async () => {
    const { c, field, onText } = setup();
    await c.start("s:f", "", onText, "en");
    c.handleResult(result("partial words"));
    c.handleError({ error: "network" });
    c.handleEnd();
    expect(field.value).toBe("partial words");
    expect(c.snapshot().status).toBe("idle");
  });
});

describe("the recognizer ending a session (the 'Listening… then nothing' problem)", () => {
  const wait = () => new Promise((r) => setTimeout(r, 5));

  test("uses the standard microphone mode, not app-side audio streaming", async () => {
    const { c, calls, onText } = setup();
    await c.start("s:f", "", onText, "en");
    const [, options] = calls.find((x) => x[0] === "start");
    expect(options.continuous).toBe(false);
    expect(options.recordingOptions).toEqual({ persist: false });
  });

  test("the language check is cached, so later taps don't probe the recognizer again", async () => {
    const { c, onText, mod } = setup();
    await c.start("s:f", "", onText, "en");
    c.handleEnd();
    await c.start("s:f", "", onText, "en");
    expect((mod as any).probes).toBe(1);
  });

  test("a transient error right after starting is retried once, then reported with its code", async () => {
    const { c, calls, onText, problems } = setup();
    await c.start("s:f", "", onText, "en");
    c.handleError({ error: "busy" });
    c.handleEnd();
    await wait();
    expect(calls.filter((x) => x[0] === "start")).toHaveLength(2);
    expect(c.snapshot().status).toBe("listening");
    expect(problems).toEqual([]);
    c.handleError({ error: "client" });
    c.handleEnd();
    expect(problems).toEqual([{ target: "s:f", issue: "recognition_failed", code: "client", downloadLocale: undefined }]);
    expect(c.snapshot().status).toBe("idle");
  });

  test("each recognizer error is explained instead of silently ending", async () => {
    const run = async (code: string, speech = "") => {
      const t = setup();
      await t.c.start("s:f", "", t.onText, "hi");
      if (speech) t.c.handleResult(result(speech));
      t.c.handleError({ error: code });
      t.c.handleEnd();
      return t;
    };
    expect((await run("audio-capture")).problems[0]).toMatchObject({ issue: "mic_in_use", code: "audio-capture" });
    const lang = await run("language-not-supported");
    expect(lang.problems[0]).toMatchObject({ issue: "model_not_installed", downloadLocale: "hi-IN" });
    expect((await run("no-speech")).problems[0]).toMatchObject({ issue: "no_speech" });
    expect((await run("no-speech", "hello")).problems).toEqual([]); // words were heard: nothing to explain
    expect((await run("aborted")).problems).toEqual([]);
  });

  test("ending with nothing heard says so; a stop by the student says nothing", async () => {
    const quiet = setup();
    await quiet.c.start("s:f", "", quiet.onText, "en");
    quiet.c.handleEnd();
    expect(quiet.problems.map((p) => p.issue)).toEqual(["no_speech"]);
    const stopped = setup();
    await stopped.c.start("s:f", "", stopped.onText, "en");
    stopped.c.stop();
    stopped.c.handleEnd();
    expect(stopped.problems).toEqual([]);
  });

  test("error mapping", () => {
    expect(issueForRecognizerError("not-allowed", false)).toBe("permission_blocked");
    expect(issueForRecognizerError("speech-timeout", false)).toBe("no_speech");
    expect(issueForRecognizerError("network", false)).toBe("recognition_failed");
  });

  test("the permission dialog no longer cancels the first tap; errors are logged with their code", () => {
    const hook = read("hooks/useDictation.ts");
    expect(hook).toContain('state === "background" && getController().snapshot().status !== "starting"');
    expect(hook).toContain("[DICTATION] recognizer error");
    expect(hook).toContain("getController().onProblem(");
    const en = JSON.parse(read("i18n/locales/en.json"));
    for (const k of ["no_speech", "mic_in_use", "recognition_failed"]) expect(en.dictation.issue[k].title, k).toEqual(expect.any(String));
    expect(en.dictation.issue.recognition_failed.body).toContain("{{code}}");
  });
});

describe("availability and permissions", () => {
  test("permission denied, or blocked for good, is reported and nothing starts", async () => {
    const denied = setup({ requestPermissionsAsync: async () => ({ granted: false, canAskAgain: true }) });
    expect(await denied.c.start("s:f", "", denied.onText, "en")).toMatchObject({ started: false, issue: "permission_denied" });
    expect(denied.calls.some((x) => x[0] === "start")).toBe(false);
    const blocked = setup({ requestPermissionsAsync: async () => ({ granted: false, canAskAgain: false }) });
    expect(await blocked.c.start("s:f", "", blocked.onText, "en")).toMatchObject({ issue: "permission_blocked" });
    expect(blocked.c.snapshot().status).toBe("idle");
  });

  test("only Android 13+ with on-device recognition is allowed; everything else keeps the keyboard", async () => {
    const cases: Array<[Partial<SpeechModuleLike>, any, string]> = [
      [{}, { platform: "ios", androidApiLevel: null }, "platform_unsupported"],
      [{}, { platform: "web", androidApiLevel: null }, "platform_unsupported"],
      [{}, { platform: "android", androidApiLevel: 32 }, "android_too_old"],
      [{ isRecognitionAvailable: () => false }, android, "service_unavailable"],
      [{ supportsOnDeviceRecognition: () => false }, android, "on_device_unavailable"],
      [{ getSupportedLocales: async () => { throw new Error("x"); } }, android, "service_unavailable"],
    ];
    for (const [overrides, env, issue] of cases) {
      const t = setup(overrides, env);
      const permission = vi.fn(async () => ({ granted: true, canAskAgain: true }));
      if (!overrides.requestPermissionsAsync) (t as any).c["getModule"]().requestPermissionsAsync = permission;
      expect(await t.c.start("s:f", "", t.onText, "en"), issue).toMatchObject({ started: false, issue });
      expect(t.calls.some((x) => x[0] === "start"), issue).toBe(false);
      expect(permission, `${issue}: microphone is not requested when dictation cannot run`).not.toHaveBeenCalled();
    }
  });

  test("an app build without the native module reports that an update is needed", async () => {
    const c = new DictationController(() => null, android);
    expect(await c.start("s:f", "", () => {}, "en")).toMatchObject({ issue: "needs_app_update" });
  });
});

describe("a build without the microphone permission", () => {
  test("a refusal on the very first request means the build is missing the permission, not a user choice", () => {
    expect(resolvePermissionIssue("permission_blocked", false)).toBe("build_missing_microphone");
    expect(resolvePermissionIssue("permission_blocked", true)).toBe("permission_blocked");
    expect(resolvePermissionIssue("permission_denied", false)).toBe("permission_denied");
    expect(resolvePermissionIssue("language_unavailable", false)).toBe("language_unavailable");
  });

  test("the app explains it and remembers that it has asked before", () => {
    const hook = read("hooks/useDictation.ts");
    expect(hook).toContain("resolvePermissionIssue(result.issue, askedBefore)");
    expect(hook).toContain("MIC_REQUESTED_KEY");
    const en = JSON.parse(read("i18n/locales/en.json"));
    expect(en.dictation.issue.build_missing_microphone.body).toMatch(/latest test version/);
  });
});

describe("languages", () => {
  test("each app language maps to its Indian locale when installed", () => {
    const all = { locales: [], installedLocales: ["en-IN", "hi-IN", "ta-IN", "te-IN"] };
    expect(chooseOnDeviceLocale("en", all)).toEqual({ ok: true, locale: "en-IN" });
    expect(chooseOnDeviceLocale("hi", all)).toEqual({ ok: true, locale: "hi-IN" });
    expect(chooseOnDeviceLocale("ta", all)).toEqual({ ok: true, locale: "ta-IN" });
    expect(chooseOnDeviceLocale("te", all)).toEqual({ ok: true, locale: "te-IN" });
    expect(chooseOnDeviceLocale("xx", all)).toEqual({ ok: true, locale: "en-IN" });
  });

  test("falls back to another installed variant of the same language, never another language", () => {
    expect(chooseOnDeviceLocale("en", { locales: [], installedLocales: ["en_US", "hi-IN"] })).toEqual({ ok: true, locale: "en_US" });
    expect(chooseOnDeviceLocale("ta", { locales: [], installedLocales: ["en-IN", "hi-IN"] })).toEqual({ ok: false, issue: "language_unavailable" });
  });

  test("a supported but not downloaded language offers the download; unsupported ones say so", async () => {
    expect(chooseOnDeviceLocale("te", { locales: ["te-IN"], installedLocales: ["en-IN"] })).toEqual({ ok: false, issue: "model_not_installed", downloadLocale: "te-IN" });
    const t = setup({}, android, ["en-IN"]);
    expect(await t.c.start("s:f", "", t.onText, "hi")).toMatchObject({ started: false, issue: "language_unavailable" });
  });
});

describe("integration in the app (source checks; device behaviour is verified manually)", () => {
  const companion = read("app/(auth)/tools/companion.tsx");
  const reframe = read("app/(auth)/tools/reframe.tsx");
  const hook = read("hooks/useDictation.ts");

  test("the companion's existing mic now uses on-device dictation; the browser-only cloud path is gone", () => {
    expect(companion).toContain('useDictationField(dictation, "message", inputVal, setInputVal)');
    expect(companion).not.toMatch(/webkitSpeechRecognition|new SpeechRecognition\(/);
    expect(companion).toContain("handleSend(inputVal)"); // Send stays manual and unchanged
  });

  test("CBT free-text fields have a mic; selectors and sliders do not", () => {
    for (const field of ["chat", "balancedThought", "supportWriting", "growthReflection", "growthStrength", "growthGratitude", "growthTomorrow"]) {
      expect(reframe).toContain(`field="${field}"`);
    }
    expect(reframe.match(/<DictationButton/g)).toHaveLength(7);
    for (const component of ["BeliefSelector", "IntensitySelector"]) {
      const start = reframe.indexOf(`function ${component}`);
      const body = reframe.slice(start, reframe.indexOf("\nfunction ", start + 10) > 0 ? reframe.indexOf("\nfunction ", start + 10) : start + 3000);
      expect(body).not.toContain("Dictation");
    }
    for (const f of ["saved-reframes", "evening-gratitude", "morning-affirmation"]) {
      expect(read(`app/(auth)/tools/${f}.tsx`)).toContain("<DictationButton");
    }
  });

  test("dictation never touches the backend or stores audio, and stops when leaving the screen", () => {
    const sources = [hook, read("common/dictation.ts"), read("components/ui/DictationButton.tsx")].join("\n");
    expect(sources).not.toMatch(/convex|useMutation|useAction|fetch\(/);
    expect(read("common/dictation.ts")).toContain("persist: false");
    expect(hook).toContain("useFocusEffect");
    expect(hook).toContain("AppState.addEventListener");
  });

  test("the native config keeps every existing plugin and permission", () => {
    const app = JSON.parse(read("app.json")).expo;
    const plugins = app.plugins.map((p: any) => (Array.isArray(p) ? p[0] : p));
    for (const p of ["expo-router", "expo-splash-screen", "expo-font", "expo-secure-store", "expo-local-authentication", "expo-web-browser", "expo-video", "expo-notifications", "expo-speech-recognition"]) {
      expect(plugins).toContain(p);
    }
    // Existing permissions kept; the microphone is declared explicitly as well as by the plugin.
    expect(app.android.permissions).toEqual([
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECORD_AUDIO",
    ]);
    expect(JSON.parse(read("package.json")).dependencies["expo-speech-recognition"]).toBe("~3.1.3");
  });
});
