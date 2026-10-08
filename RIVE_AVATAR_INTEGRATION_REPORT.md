# Emoty Rive Avatar Integration: Engineering Report

Branch `claude/blissful-knuth-04nxs0`, on top of `19afe4d`.

**Status:**
- The app-side integration is built and tested (typecheck, unit/source tests, Android and web bundles).
- The final Rive animation files are not available yet, so nothing animated has been checked visually.
- No `.riv` file was created or faked. Both characters set `riveAsset: null` and render exactly as before.

## 1. Discoveries

### Girl reference asset

`assets/emoty_girl_avatar.jpg` does not exist. I ran `git fetch origin` and searched:
- `origin/claude/blissful-knuth-04nxs0`;
- `origin/main`;
- all git history (`git log --all -- 'assets/emoty_girl_avatar*'`);
- the working tree, for `*girl*` and `*.riv` files.

Nothing was found. The only character artwork is `assets/emoty_boy_avatar.jpg` (1024×1024 RGB JPEG). The girl preference therefore still shows the boy character, as before. Nothing was invented for her.

### Versions

| Item | Version |
| --- | --- |
| Expo SDK | ~54.0.36 |
| React Native | 0.81.5 (New Architecture is the SDK 54 default) |
| React | 19.1.0 |
| Builds | EAS APK; no committed `android/` or `ios/` (prebuild on EAS) |
| Web | react-native-web, static output |
| Rive | not previously installed |

### Rive runtime choice

| Package | Notes |
| --- | --- |
| `rive-react-native` 9.8.5 | Its README calls itself the legacy package, with a long-term migration to the new runtime. It drives the view through `requireNativeComponent`, `findNodeHandle` and `UIManager` commands (old-architecture interop). |
| `@rive-app/react-native` ("Rive React Native 2.0", Nitro) | Requires RN 0.78+, Expo SDK 53+ and `react-native-nitro-modules`. It is Rive's designated runtime and is built for the New Architecture. |

I chose `@rive-app/react-native`, pinned exactly:
- **`@rive-app/react-native@0.4.20`**, released 2026-08-19. This is the stable 0.4 line; 0.5.x is less than 10 days old.
- **`react-native-nitro-modules@0.35.10`**, matching its peer range `>=0.35.10 <0.36`.

It was installed with `--legacy-peer-deps`. A plain `npm install` would also have added unrelated, previously absent optional peers of Clerk (Solana wallet packages). With the flag, the lockfile adds only these two packages and changes no existing version.

No other animation library was added. The existing RN `Animated` motion stays as the fallback motion.

### Existing architecture reused

- **App event → avatar state:** `getEmotyPresence` (`common/emotyPresence.ts`) followed by `resolveAvatarPresentationState` (`common/avatarPresentation.ts`). This is already the single mapping layer, and it already gives safety precedence (crisis/elevated → supportive).
- **One avatar component:** `components/avatar/EmotyAvatar.tsx`, with gender prop or context, `state`, `size`, `style`, `speaking`, reduced-motion handling, and an image-error fallback.
- **Gender:** stored as `avatarGender: 'male' | 'female'` through `AvatarContext`. `EmotyAvatar` also accepts `'boy' | 'girl'`.

### Avatar usages, classified

| Class | Sites | Migrated? |
| --- | --- | --- |
| Persistent / emotional companion presence | `EmotyPresence` (home check-in reaction, screening intro/submitting, Think Differently, Small Steps, safety modal); Home hero (`(tabs)/index.tsx`); companion chat header + empty state (`tools/companion.tsx`); Think Differently completion (`tools/reframe.tsx`) | **Yes** (`live`) |
| Onboarding / profile, user-selected (gender pickers and previews) | `onboarding/welcome.tsx`, `(tabs)/profile.tsx` | No: static illustration |
| Per-message / typing indicators (many instances) | companion message bubbles, reframe "thinking…" | No |
| Tool-step and decorative illustrations | emotion-map, emoty-goal, jpmr (breathing pacing), appointments, microgoals and home celebration modals, tools-tab icon | No |

## 2. Files changed

| File | Change | Why |
| --- | --- | --- |
| `common/avatarEmotion.ts` (new) | Five emotions; `avatarEmotionForState` (13 states → 5); `AVATAR_EMOTION_STATE`; `EMOTY_RIVE_CONTRACT` | Pure mapping layer plus the `.riv` contract, testable without RN |
| `components/avatar/emotyAvatarConfig.ts` (new) | `EMOTY_AVATAR_CONFIG` with `riveAsset` and `fallbackAsset` per character (`boy`, `girl`); `toEmotyCharacterId`; `getEmotyCharacter` (stable resolved objects); `CANONICAL_EMOTY_BOY_AVATAR` moved here | The one place that names character artwork |
| `components/avatar/EmotyRiveCharacter.native.tsx` (new) | The only file importing the Rive runtime. It loads the file once (`useRiveFile`) and drives inputs on one view (`setNumberInputValue` / `setBooleanInputValue`). Any failure calls `onUnavailable`. The runtime is required lazily inside try/catch | Keeps Rive calls in one place; a build without the native module (for example Expo Go) falls back instead of crashing |
| `components/avatar/EmotyRiveCharacter.tsx` (new) | Web stub (`isRiveRuntimeAvailable() → false`) | The web bundle never includes the native runtime |
| `components/avatar/EmotyAvatar.tsx` | New `emotion?` and `live?` props; registry moved to config; a Rive layer inside the existing circular frame; the illustration shown until Rive is ready, and on any failure; RN frame motion and blink stop once Rive is ready; the reduced-motion flag is forwarded | Same component API, so screens don't change |
| `components/avatar/EmotyPresence.tsx` | Passes `live` | Companion presence |
| `app/(auth)/(tabs)/index.tsx`, `app/(auth)/tools/companion.tsx` (header + empty state), `app/(auth)/tools/reframe.tsx` (completion) | Add `live` | Companion presence sites only |
| `metro.config.js` (new) | Expo default config plus `assetExts.push('riv')` | Lets `.riv` files be bundled with `require()` |
| `package.json`, `package-lock.json` | +`@rive-app/react-native@0.4.20`, +`react-native-nitro-modules@0.35.10` (exact) | Official runtime |
| `common/avatarEmotion.test.ts` (new) | 7 tests | Mapping, safety precedence, contract |
| `convex/emotyAvatarVisual.test.ts` | 5 assertions re-pointed from `EmotyAvatar.tsx` to `emotyAvatarConfig.ts` (same intent); 6 new integration tests | Registry moved; guards for the new architecture |

Unchanged: clinical logic, screening scoring, triage, safety classification, counsellor features, Convex functions, schema, auth, production config, `AvatarContext`, and the stored gender format. No global state was added.

## 3. Architecture

```
app event / screen context
  → getEmotyPresence(...)                    common/emotyPresence.ts (existing)
  → resolveAvatarPresentationState(...)      common/avatarPresentation.ts (existing; safety wins)
  → <EmotyAvatar state=… gender=… live />    components/avatar/EmotyAvatar.tsx
       character = getEmotyCharacter(toEmotyCharacterId(gender))   emotyAvatarConfig.ts
       emotion   = props.emotion ?? avatarEmotionForState(state)   common/avatarEmotion.ts
       live && character.riveAsset && runtime available?
         yes → <EmotyRiveCharacter>   (illustration shown until ready, and again on failure)
                 setNumberInputValue('emotion', EMOTY_RIVE_CONTRACT.emotionValues[emotion])
                 setBooleanInputValue('speaking', speaking)
                 setBooleanInputValue('reducedMotion', reduceMotion)
         no  → existing illustration + RN Animated motion (unchanged)
```

### State mapping (13 → 5)

| Emotion | States |
| --- | --- |
| idle | idle, calm, listening, breathing |
| happy | happy, celebrating |
| encouraging | encouraging |
| thinking | thinking |
| concerned | supportive, sad, worried, tired, angry |

Safety (supportive) and difficult states are always shown as calm **concerned**. Emoty never mirrors distress or anger.

### Performance

- The Rive layer is keyed only by the `.riv` source. Emotion, speaking and reduced-motion changes are input updates on the same view, never a remount (asserted by a test).
- Config objects are resolved once at module load, so re-renders don't reload the file.
- Message-bubble avatars stay static images, so there is no Rive view per chat message.

### Accessibility

- The existing accessible label and role on the container are unchanged.
- The Rive subtree is hidden from accessibility.
- The OS reduce-motion setting is forwarded as the `reducedMotion` input, and the RN frame motion still zeroes out.

### Fallback

The illustration shows when:
- the build is web;
- the native module is missing;
- the `.riv` file is loading;
- the file fails to load;
- the artboard, state machine or input name is wrong;
- the view fails to become ready within 5 s (the runtime's own timeout).

Image error still shows the "E" initial.

### API

```tsx
<EmotyAvatar gender="boy" | "girl" | "male" | "female" emotion?="idle" | "happy" | "encouraging" | "thinking" | "concerned"
             state?={presence.avatarState} size?="xs" | "sm" | "md" | "lg" | "xl" | number style?={…} speaking? live? />
```

Screens should keep passing `state` from `getEmotyPresence` so safety precedence applies. `emotion` is for simple direct uses.

## 4. Rive asset requirements

Both characters use the same contract (`EMOTY_RIVE_CONTRACT`, `common/avatarEmotion.ts`).

| Item | Required value |
| --- | --- |
| Files | `assets/rive/emoty_boy.riv`, `assets/rive/emoty_girl.riv` |
| Artboard | `Emoty`: square, head and shoulders centred, same framing as the reference JPG (it is cropped to a circle) |
| State machine | `EmotyStateMachine`, initial state `Idle` |
| Input `emotion` (Number) | `0` → `Idle`, `1` → `Happy`, `2` → `Encouraging`, `3` → `Thinking`, `4` → `Concerned`. Transitions from Any State, with a ~250–400 ms blend |
| Input `speaking` (Boolean) | Gentle talk/mouth layer while true |
| Input `reducedMotion` (Boolean) | When true, hold a still pose per emotion: no idle loops, bounces or sways; cross-fade only |

What each state should look like:
- **Idle:** slow breathing, an occasional blink.
- **Happy:** a warm smile, a small friendly nod.
- **Encouraging:** a supportive nod or slight lean-in.
- **Thinking:** eyes up or aside, a slow sway.
- **Concerned:** soft brows, a gentle kind expression, a slow calm breath. Not sad, not alarmed: no wide eyes, tears, frowning or fast motion.

Shared requirements:
- **Boy:** must match `assets/emoty_boy_avatar.jpg`: same face, hair, outfit, palette, illustration style and soft sky-blue backdrop.
- **Girl:** the visual reference `assets/emoty_girl_avatar.jpg` **does not exist yet** and must be supplied first: 1024×1024 RGB JPG, the same style, framing, proportions and backdrop as the boy. Her `.riv` must match that illustration.
- **Both:** an opaque backdrop matching the JPG, so the swap from illustration to Rive is seamless; low file size (target under 300 KB); no text, no external assets, no audio.

Wiring each file is one line in `components/avatar/emotyAvatarConfig.ts`:

```ts
boy:  { riveAsset: require('@/assets/rive/emoty_boy.riv'), fallbackAsset: CANONICAL_EMOTY_BOY_AVATAR },
girl: { riveAsset: require('@/assets/rive/emoty_girl.riv'), fallbackAsset: require('@/assets/emoty_girl_avatar.jpg') },
```

A character needs its `fallbackAsset` before it can be used; without one it falls back to the boy. The girl JPG is therefore a prerequisite for the girl `.riv`.

## 5. Remaining work

### Engineering

- Run an EAS Android build. It is the first native compile of the Rive and Nitro modules; there is no Android SDK in this environment.
- After a `.riv` is added, check on a device:
  - each emotion transition;
  - speaking;
  - the OS "Remove animations" setting;
  - fallback with a deliberately wrong state machine name;
  - memory on the Home → companion chat path.
- Optional: `@rive-app/react-native` 0.5 moves toward data binding (view models) and marks inputs as legacy, though still supported. Migrating later only touches `EmotyRiveCharacter.native.tsx` and the contract.

### Rive artwork

- `emoty_boy.riv` built from the boy JPG to the contract above.
- `emoty_girl.riv` built from the girl JPG.

### Manual design

- Supply `assets/emoty_girl_avatar.jpg`.
- Sign off on how gentle the "concerned" state looks.
- Check the framing at xs (32 px) and lg (140 px).

## 6. Validation actually run

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p .` | pass (no errors) |
| `npx tsc --noEmit -p convex` | pass (no errors) |
| `npx vitest run` | 67 files, **1163 / 1163 passed** (previously 1150; +13 new) |
| `npx expo export --platform android` | success; the Hermes bundle contains the Nitro runtime and the contract |
| `npx expo export --platform web` | success; the web bundle contains **no** `@rive-app`, NitroModules or `setNumberInputValue` code (only the contract constant) |
| `npx expo-modules-autolinking react-native-config --platform android` | both `com.rive.RivePackage` and `NitroModulesPackage` autolink (with CMake) |

There is no lint script or ESLint config in this repository, so no lint was run.

**Not tested:**
- native Android/iOS compilation;
- on-device rendering;
- any Rive animation.

No `.riv` exists, so the Rive path has not executed anywhere, and the `live` sites currently render the same illustration as before.
