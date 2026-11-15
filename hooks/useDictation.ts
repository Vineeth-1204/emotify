import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useLanguage } from "@/context/LanguageContext";
import { DictationController, type DictationIssue, type DictationSnapshot, type SpeechModuleLike } from "@/common/dictation";

/**
 * Voice-to-text for free-text inputs (see common/dictation.ts for the privacy and platform
 * rules). One controller is shared app-wide, so there is never more than one session.
 *
 *   const dictation = useDictation();                       // once per screen
 *   const mic = useDictationField(dictation, "situation", text, setText);  // per input
 *   <Mic onPress={mic.toggle} active={mic.isListening} />
 *
 * Listening stops when the screen loses focus or unmounts, the app goes to the background, the
 * input is removed, or the student edits/clears/sends the text themselves.
 */

let speechModule: SpeechModuleLike | null | undefined;
let listenersAttached = false;
let controller: DictationController | null = null;

function loadSpeechModule(): SpeechModuleLike | null {
  if (speechModule !== undefined) return speechModule;
  try {
    // Loaded lazily: a build made before this native module was added keeps working (keyboard only).
    speechModule = require("expo-speech-recognition").ExpoSpeechRecognitionModule ?? null;
  } catch {
    speechModule = null;
  }
  if (speechModule && !listenersAttached) {
    const mod = speechModule as any;
    mod.addListener("result", (e: any) => controller?.handleResult(e));
    mod.addListener("error", (e: any) => controller?.handleError(e));
    mod.addListener("end", () => controller?.handleEnd());
    listenersAttached = true;
  }
  return speechModule ?? null;
}

function getController(): DictationController {
  if (!controller) {
    controller = new DictationController(loadSpeechModule, {
      platform: Platform.OS,
      androidApiLevel: Platform.OS === "android" ? Number(Platform.Version) : null,
    });
  }
  return controller;
}

let ownerSequence = 0;

export interface Dictation {
  owner: string;
  snapshot: DictationSnapshot;
  toggle: (field: string, value: string, setValue: (text: string) => void) => Promise<void>;
  isListening: (field: string) => boolean;
}

export function useDictation(): Dictation {
  const { language, t } = useLanguage();
  const [owner] = useState(() => `dictation${++ownerSequence}`);
  const [snapshot, setSnapshot] = useState<DictationSnapshot>(() => getController().snapshot());

  useEffect(() => {
    const unsubscribe = getController().subscribe(setSnapshot);
    return () => {
      unsubscribe();
      getController().abortOwner(owner);
    };
  }, [owner]);

  // Leaving the screen (navigation or tab change) stops the microphone.
  useFocusEffect(
    useCallback(() => () => getController().abortOwner(owner), [owner])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") getController().abortOwner(owner);
    });
    return () => sub.remove();
  }, [owner]);

  const explain = useCallback(
    (issue: DictationIssue, downloadLocale?: string) => {
      const title = t(`dictation.issue.${issue}.title`);
      const body = t(`dictation.issue.${issue}.body`);
      if (issue === "model_not_installed" && downloadLocale) {
        Alert.alert(title, body, [
          { text: t("dictation.notNow"), style: "cancel" },
          {
            text: t("dictation.download"),
            onPress: () => {
              loadSpeechModule()
                ?.androidTriggerOfflineModelDownload?.({ locale: downloadLocale })
                .then((r) => {
                  if (r.status === "download_success") Alert.alert(t("dictation.downloaded.title"), t("dictation.downloaded.body"));
                })
                .catch(() => Alert.alert(t("dictation.issue.failed.title"), t("dictation.issue.failed.body")));
            },
          },
        ]);
        return;
      }
      if (issue === "permission_blocked") {
        Alert.alert(title, body, [
          { text: t("dictation.ok"), style: "cancel" },
          { text: t("dictation.openSettings"), onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
      Alert.alert(title, body, [{ text: t("dictation.ok") }]);
    },
    [t]
  );

  const toggle = useCallback(
    async (field: string, value: string, setValue: (text: string) => void) => {
      const c = getController();
      const target = `${owner}:${field}`;
      const current = c.snapshot();
      if (current.status !== "idle") {
        // Second tap stops (also when another input on the screen is listening).
        c.stop();
        return;
      }
      const result = await c.start(target, value, setValue, language);
      if (!result.started && !result.ignored) explain(result.issue, result.downloadLocale);
    },
    [owner, language, explain]
  );

  const isListening = useCallback(
    (field: string) => snapshot.target === `${owner}:${field}` && snapshot.status !== "idle",
    [snapshot, owner]
  );

  return { owner, snapshot, toggle, isListening };
}

/** Binds one text input to dictation. */
export function useDictationField(dictation: Dictation, field: string, value: string, setValue: (text: string) => void) {
  const target = `${dictation.owner}:${field}`;

  // The student typed, cleared or sent the text while listening: their keyboard edit wins.
  useEffect(() => {
    if (getController().isOwnText(target, value) === false) getController().abort(target);
  }, [target, value]);

  // The input itself was removed (step change, modal closed).
  useEffect(() => () => getController().abort(target), [target]);

  const toggle = useCallback(() => dictation.toggle(field, value, setValue), [dictation, field, value, setValue]);
  return { isListening: dictation.isListening(field), toggle };
}
