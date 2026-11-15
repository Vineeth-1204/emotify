# Emotify – Voice-to-Text Input

Date: 2026-11-15. Branch: `claude/blissful-knuth-04nxs0`.

Students can speak instead of typing in free-text inputs. Voice input is an extra way to fill
the same text box: typing still works everywhere, the dictated words can be edited, and nothing
is sent until the student taps the existing Send or Continue button.

## Library and native configuration

| Item | Change |
|---|---|
| Dependency | `expo-speech-recognition@~3.1.3` (its `sdk-54` release). No other package changed. |
| `app.json` | Config plugin added after the existing plugins, with microphone and speech permission text ("Nothing is recorded or saved") and the Android speech service packages `com.google.android.as`, `com.google.android.tts` and `com.google.android.googlequicksearchbox`. |
| Generated Android manifest | Checked with `expo prebuild`: adds `RECORD_AUDIO` and the speech-service `<queries>`; all existing permissions are kept. |
| Native rebuild | **Required.** Run `eas build --profile development --platform android`. A build made before this change keeps working and shows "Update needed" when the microphone is tapped. |

## Where voice input appears

| Screen | Fields |
|---|---|
| Companion chat | The existing microphone button beside the message box. It previously worked only in a web browser; on phones it showed a "use your keyboard microphone" message. |
| Think Differently (CBT) | The conversation input, which collects the Situation, Automatic Thought and guided-discovery answers; the balanced-thought edit box; Support Mode free writing; the four Positive Growth text boxes. |
| Saved reframes | Editing a saved reframe. |
| Evening gratitude | Each gratitude entry. |
| Morning affirmation | The custom intention. |

No microphone was added to multiple-choice questions, sliders, belief or intensity selectors, or emotion pickers.

## Privacy and platform policy

Recognition runs only on the phone (`requiresOnDeviceRecognition`). Audio is never recorded or
stored (`recordingOptions.persist: false`), and nothing is sent to Convex. Only the recognised
words go into the text box. Where on-device recognition cannot be guaranteed, voice input does
not start, a short message explains why, and the keyboard keeps working.

| Platform | Behaviour |
|---|---|
| Android 13+ | Allowed. Android's strict on-device recognizer is used for the language. If the language is supported but not downloaded, the student can download it. |
| Android 12 and below | Not offered. The library only *prefers* offline recognition there and may go online. |
| iOS | Not offered. The library uses Apple's servers whenever the chosen language has no on-device model, and the app cannot check this per language. |
| Web | Not offered. Browser recognition is server-based; the previous web dictation, which used it, is removed. |

## Languages

The app language selects the locale: English `en-IN`, Hindi `hi-IN`, Tamil `ta-IN`, Telugu `te-IN`.
Before starting, the app checks the phone's installed on-device models:

- If the exact locale isn't installed, another installed variant of the same language is used (for example `en-US` for English).
- If only a model for a different language is installed, it is never used.
- Whether Hindi, Tamil and Telugu work offline depends on the phone; this must be checked on a device.

## Behaviour

| Behaviour | Detail |
|---|---|
| Combining with typed text | Dictated words are added after the existing text, never replacing it. Silence changes nothing. Partial results update in place, so words are not duplicated. |
| One session at a time | Only one session can run in the app at once; a second tap stops listening. |
| When listening stops | When the student leaves the screen, the app goes to the background, the field disappears, the student types or clears the text, or a message is sent. Sessions also end after two minutes. |
| What stays the same | CBT wording, step order, response storage, Convex schemas and mutations, companion prompts, and the safety and counsellor workflows. |

## Files

| Kind | Files |
|---|---|
| New | `common/dictation.ts` (rules and session controller), `common/dictation.test.ts` (20 tests), `hooks/useDictation.ts`, `components/ui/DictationButton.tsx` |
| Changed | `app/(auth)/tools/companion.tsx`, `reframe.tsx`, `saved-reframes.tsx`, `evening-gratitude.tsx`, `morning-affirmation.tsx`; `app.json`; `package.json` / `package-lock.json`; `i18n/locales/en.json` |

The new messages are in English. Hindi, Tamil and Telugu show English until they are translated.

## Verification

| Check | Result |
|---|---|
| `npx vitest run common/dictation.test.ts` | 20/20 pass. Six deliberate defects were each caught. |
| Full suite | 1,594 of 1,605 tests pass. The 11 failures were already present: the specification file moved into `docs/`, appointment dates in fixtures have passed, and one CBT label expectation. |
| Type checks | App, Convex and dashboard: 0 errors. |
| `expo export --platform android` | Succeeds; the bundle includes the speech module. |
| `expo prebuild --platform android` | Manifest contains `RECORD_AUDIO` and the speech-service queries. |

### Not yet verified on a device

1. Build the development APK and install it on an Android 13+ phone.
2. In the companion chat, type a few words, tap the microphone and speak English. The words are added after the typed text. Tap again to stop, edit the text, then press Send yourself.
3. Switch the app language to Hindi, Tamil and Telugu and repeat. Note which languages need the "Download your language" step, and which aren't offered at all on that phone.
4. Deny the microphone permission: a message appears and typing still works. Deny with "Don't ask again": the message offers Open settings.
5. Start listening, then go back or switch tabs: the microphone indicator in the Android status bar turns off.
6. In Think Differently, dictate the situation and the thought, continue through the steps, and complete Positive Growth. Check that the session saves as before.
