    # EMOTIFY — Avatar-First UX Transformation: ADDENDUM

    This addendum extends the original spec with the missing execution-layer detail: an audit phase, a formal avatar state machine, the emotion/intensity/activity data dictionary, expanded accessibility rules, a performance budget, a voice fallback spec, and testable success criteria. Insert this as **Phase 0** and supporting sections alongside the original document.

    ---

    ## PHASE 0 — Audit (run before Phase 1)

    Nothing in Phase 1 can start safely until the current system is documented. This phase produces the source-of-truth artifacts that Phases 1–6 depend on.

    ### 0.1 Emoji Inventory
    - Grep the full student-facing codebase for all Unicode emoji, emoji-style icon components, and emoji-referencing string constants.
    - Produce a table: `emoji → file/component location(s) → semantic purpose → proposed SVG replacement (from §25 asset structure)`.
    - This table becomes the checklist for §26 and the regression check in Phase 6 Step 33.

    ### 0.2 Emotion & Intensity Taxonomy
    - Extract the **exact enum values / API contract** the backend currently uses for emotion check-ins (not the illustrative labels in the original spec).
    - Extract the exact intensity levels/scale currently stored (e.g., 0–10, or a 4-tier enum) and how they map to routing decisions.
    - Output: the raw backend vocabulary, unedited, ready to feed into the Data Dictionary (Section B below).

    ### 0.3 Microgoal / Activity Categories
    - List every microgoal/activity category the personalization engine can select (hydration, stretching, walking, journaling, talking, breathing, grounding, etc.), including any not mentioned in the original spec.
    - Note cooldown/effectiveness fields the backend tracks per category, so the avatar-memory feature (§15) has a real data source to read from.

    ### 0.4 Stack & Platform Confirmation
    - Confirm target platform(s): native mobile (iOS/Android), React Native, or web/PWA.
    - Confirm animation approach constraints (native driver support, SVG animation libraries already in use, existing design system/component library if any).
    - Confirm minimum supported device tier — this determines the Performance Budget (Section D).

    ### 0.5 Screen Inventory
    - List every existing student-facing screen/flow that currently uses emoji and/or paragraph-style instructions, so Phase 6's text-audit (Step 24) has a checklist instead of starting blind.

    **Deliverable of Phase 0:** a single reference doc (or shared spreadsheet) containing the emoji inventory, emotion/intensity vocabulary, activity category list, platform constraints, and screen inventory. Phases 1–6 reference this doc rather than re-deriving it ad hoc.

    ---

    ## SECTION A — Avatar State Machine (replaces the flat state list in original §6/§24)

    The original spec lists valid avatar states but not how the app decides which one is active. This section defines explicit priority and transition rules.

    ### A.1 State Priority Stack (highest to lowest)

    | Priority | Layer | Can be interrupted by |
    |---|---|---|
    | 1 (highest) | **Safety state** (serious/supportive) | Nothing. Once triggered, no other layer can override or resume until safety flow exits. |
    | 2 | **Active intervention state** (breathing, listening, grounding-in-progress) | Safety only |
    | 3 | **Check-in reaction state** (worried, tense, sad, angry — driven by emotion/intensity selection) | Safety, then a new intervention start |
    | 4 | **Celebration/feedback state** (celebrating, encouraging — Calm Point awarded, goal completed) | Safety, intervention start, or a new check-in |
    | 5 (lowest) | **Idle/navigation state** (calm, idle, thinking, listening-for-input) | Any of the above |

    **Rule:** the app must always evaluate priority 1 (safety) first on every state-change request, regardless of what triggered the request. This is a hard invariant, not a UX suggestion — implement it as a guard clause at the single point where avatar state is set, not scattered per-screen.

    ### A.2 State Transition Table

    | From state | Trigger | To state | Notes |
    |---|---|---|---|
    | idle | student opens emotion check-in | listening | avatar shows subtle attentive animation |
    | listening | student selects emotion (e.g. "Worried") | worried | immediate visual transition, no delay |
    | worried | student selects intensity: low | worried (relaxed variant) | subtle, not full tense |
    | worried | student selects intensity: high | angry/tense posture variant | visibly tense per §7 |
    | worried | student selects intensity: overwhelming | **safety-check evaluation state** | routes to Priority 1 if safety condition met |
    | any check-in state | intervention started | breathing / thinking (per activity) | Priority 2 begins |
    | breathing (in progress) | intervention completed | encouraging → calm | before/after transition, §16 |
    | calm | Calm Point awarded | celebrating | brief, then returns to idle |
    | celebrating | 2–3s elapsed OR student taps through | idle | auto-decay, no lingering gamified state |
    | any state | student skips | encouraging (soft, non-punitive) → idle | never a "failure" visual, per §19 |
    | ANY state | safety condition triggers | **serious/supportive** | overrides everything, per Priority 1 |

    ### A.3 Animation-to-Meaning Mapping (formalizes original §24)

    | State | Animation behavior | Duration/frequency |
    |---|---|---|
    | idle | slow blink, minimal sway | continuous, low-frequency |
    | listening | slight head tilt, blink on input received | triggered, ~1s |
    | thinking | small eye movement, brief pause | triggered, 1–2s |
    | worried (low) | subtle posture shift | triggered once, holds |
    | worried (high/tense) | tighter shoulders, faster blink rate | triggered once, holds |
    | breathing | chest/body expand-contract cycle | looped, timed to exercise (e.g., 4s in / 4s out) |
    | calm | slow breathing loop | continuous, low-frequency |
    | encouraging | small forward lean, soft smile shift | triggered, ~1s |
    | celebrating | brief upward bounce/sparField-free positive motion (no sparkles per §29) | triggered, ~1.5s, then decays to idle |
    | sad/low | slower overall movement, lowered head | triggered once, holds until next check-in |
    | serious/supportive (safety) | calm, steady, no bounce or celebratory motion permitted | triggered, holds through entire safety flow |

    **Explicit rule carried over from original §28:** the safety/serious state is the only state that must never contain celebratory, bouncy, or game-like motion, even if a positive action (like contacting a counsellor) occurs during it.

    ---

    ## SECTION B — Emotion / Intensity / Activity Data Dictionary (template)

    This is the missing artifact referenced repeatedly in the original spec ("adapt to the existing emotion model"). Populate the blank columns using the Phase 0.2 and 0.3 audit output before Phase 2 begins.

    ### B.1 Emotion Check-In Dictionary

    | Backend enum value (from audit) | Student-facing label (13–18) | Student-facing label (19–24) | Avatar state | SVG asset filename |
    |---|---|---|---|---|
    | *(fill from audit)* | Good | Good | happy | `/emotions/calm.svg` |
    | *(fill from audit)* | Okay | Okay | calm | `/emotions/calm.svg` |
    | *(fill from audit)* | Low | Low | sad | `/emotions/low-mood.svg` |
    | *(fill from audit)* | Heavy | Overwhelmed | worried/tense | `/emotions/stress.svg` |
    | *(fill from audit — add rows for worry, anger, loneliness, fatigue, burnout etc. if the backend supports them)* | | | | |

    ### B.2 Intensity Dictionary

    | Backend numeric/enum value | Student-facing label | Avatar posture | SVG/animation variant |
    |---|---|---|---|
    | *(fill — e.g. 0–2)* | A little | relaxed | `avatar-calm` |
    | *(fill — e.g. 3–5)* | Some | slightly concerned | `avatar-worried` (low) |
    | *(fill — e.g. 6–8)* | A lot | visibly tense | `avatar-worried` (high) |
    | *(fill — e.g. 9–10)* | Overwhelming | distressed → routes to safety evaluation | `avatar-worried` (max) → safety check |

    ### B.3 Activity / Microgoal Dictionary

    | Backend category (from audit) | Short label (13–18) | Short label (19–24) | SVG asset | Avatar accompanying state |
    |---|---|---|---|---|
    | hydration | "Grab some water" | "Hydrate" | `/activities/hydration.svg` | encouraging |
    | stretching | "Quick stretch?" | "Stretch" | `/activities/stretching.svg` | encouraging |
    | walking | "Take a short walk" | "Walk" | `/activities/walking.svg` | encouraging |
    | journaling | "Jot it down" | "Write it out" | `/activities/journaling.svg` | listening |
    | talking | "Talk to someone" | "Reach out" | `/activities/talking.svg` | encouraging |
    | breathing | "Breathe with me" | "2-min reset" | `/activities/breathing.svg` | breathing |
    | grounding | "Let's ground" | "Ground yourself" | `/activities/grounding.svg` | thinking → listening |
    | *(add remaining categories from Phase 0.3 audit)* | | | | |

    **Note:** every row in Sections B.1–B.3 must be filled from the real backend vocabulary before implementation starts — do not implement against the illustrative labels in the original spec directly.

    ---

    ## SECTION C — Accessibility (expands original §27)

    In addition to the original requirements (semantic labels, no color-only signaling, responsive SVGs), add:

    1. **Reduced motion support.** Respect `prefers-reduced-motion` (or platform equivalent). Every looping/triggered animation (breathing, celebrating, idle sway) must have a static-frame fallback that still communicates the same state via shape/expression alone.
    2. **Screen reader path.** A student navigating via VoiceOver/TalkBack must be able to complete check-in → intensity → intervention entirely non-visually. Each SVG state needs a spoken-equivalent label (e.g., "Mitra, calm" / "Mitra, breathing exercise, inhale"), not just a static alt-text.
    3. **Minimum touch targets.** All tappable SVG cards and avatar-interaction elements meet a minimum 44×44pt (or platform-equivalent dp) target size, given mobile-first, often lower-end school devices.
    4. **Colorblind-safe differentiation.** Emotion/intensity states must be distinguishable by shape and expression alone, verified without color (not just "color is not the only indicator" — actually test with a colorblind simulation pass in Phase 6).
    5. **Text scaling.** Any remaining short text (labels, prompts) must remain legible and non-overlapping at the platform's largest standard accessibility text size.

    ---

    ## SECTION D — Performance Budget

    Given the target age group (13–24, school/shared devices, mixed device tiers), set explicit limits before implementation:

    - **Target:** stable 60fps on a mid-tier Android device from ~3 years prior to launch, and no dropped frames on animation-heavy screens (breathing, celebrating) on that baseline device.
    - **Concurrency limit:** no more than one primary avatar animation plus one secondary environmental animation active simultaneously. Do not stack multiple looping SVG animations on a single screen.
    - **Preferred implementation:** CSS/SVG-native animation (SMIL, CSS keyframes, or platform-native animation drivers) over JS-driven frame-by-frame animation, wherever the target stack (confirmed in Phase 0.4) supports it.
    - **Asset weight:** individual avatar SVG files kept lightweight (optimized/minified paths, no embedded raster images) so cold-load time on a check-in screen stays under an agreed threshold (e.g., <150ms to first paint of the avatar).
    - **Idle-state cost:** the idle/breathing-loop animation, since it may run continuously in the background, must be the cheapest animation in the system — verify it does not measurably affect battery drain over a typical session length.

    ---

    ## SECTION E — Voice Interaction Fallback Spec (expands original §21)

    In addition to "voice must remain optional, never forced":

    | Scenario | Required behavior |
    |---|---|
    | Microphone permission denied | Silently fall back to touch/text controls; do not repeatedly prompt for permission within the same session. |
    | Device has no STT/TTS capability | "Talk"/"Listen" controls are hidden entirely rather than shown disabled, so the interface never implies a broken feature. |
    | Student starts a flow with voice, then stops mid-conversation | The app must allow seamless drop to touch/text at any point without losing check-in progress (e.g., emotion already selected via voice is preserved if the student switches to tapping intensity). |
    | Background noise / low recognition confidence | Offer a graceful re-prompt ("Didn't catch that — want to tap instead?") rather than forcing repeated voice attempts. |
    | Voice used during a safety-flow (Priority 1 state) | Voice remains available if already in use, but the safety flow's core actions (helpline, counsellor contact) must always also be reachable via a visible tappable control — never voice-only. |

    ---

    ## SECTION F — Testable Success Criteria (replaces qualitative original §32)

    Each original success criterion is restated as something Phase 6 QA can actually pass/fail against:

    1. **Zero emoji in student-facing bundle.** Automated CI lint rule scanning the student-facing build for Unicode emoji ranges (U+1F300–U+1FAFF, U+2600–U+27BF, etc.). Build fails if any match is found. *(This automates the manual check in original Phase 6 Step 33; Step 33 becomes a periodic regression run of this same CI rule, not a separate manual audit.)*
    2. **Time-to-first-interaction.** From opening the home screen to the student being able to make their first tap (emotion selection), measured at ≤3 seconds on the baseline device (Section D), with zero required reading of instructional paragraphs.
    3. **One-question-at-a-time compliance.** Automated or manual screen audit confirming no student-facing screen presents more than one input request at a time (per original §9).
    4. **State-change visibility.** For every defined avatar transition in Section A.2, a screen-recording test confirms the transition is visually perceivable within 300ms of the triggering action (no silent/invisible state changes).
    5. **Intervention completion without text-reading.** A test student can complete a full breathing exercise and a full grounding exercise by following avatar/animation cues alone, verified via a moderated usability test with instructional text hidden/covered.
    6. **Before/after change legibility.** In a moderated test, students correctly identify "something changed" in the avatar's state after an intervention, without being shown or told the underlying numeric score.
    7. **Non-punitive skip verified.** QA confirms skipping a goal at any point in the flow never shows red/failure iconography, streak-loss messaging, or shame language — cross-checked against the Phase 0.1 emoji/copy inventory plus a full-flow walk-through.
    8. **Safety override integrity.** Automated + manual test confirms that triggering the safety condition from every possible entry state (idle, mid-intervention, mid-celebration) correctly interrupts and routes to the safety flow with zero exceptions — this is the single highest-priority regression test in Phase 6.

    ---

    ## SECTION G — Structural Note on Phase 6 / §26 Overlap

    Original §26 ("Replace Existing Emoji Systematically") is the **build-time replacement pass**, executed once during Phase 1–2 using the Phase 0.1 inventory as its checklist.

    Original Phase 6 Step 33 ("Verify no student-facing emoji remain") is the **regression pass**, and should run automatically via the CI rule defined in Section F.1 above on every subsequent build — not as a one-time manual re-check. Treat these as two different mechanisms (one-time manual replacement vs. ongoing automated verification), not a duplicated step.