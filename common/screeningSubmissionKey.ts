/**
 * Lifecycle of the idempotency key for a screening submission (see screening.submitScreeningAttempt).
 *
 *  - created once, the first time the student presses Submit for the current set of answers,
 *    and saved on the device next to the answer draft;
 *  - reused, unchanged, for every retry of that submission (network failure, timeout, app
 *    restart), so a submission the server already committed is never recorded twice;
 *  - discarded when any answer changes (different answers are a different submission) and after
 *    the server confirms the submission (the next check-in is a genuine reassessment and gets a
 *    new key).
 * Pure: storage and the random generator are passed in, so the lifecycle is testable.
 */
export interface KeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const SUBMISSION_KEY_PREFIX = "screening_submission_key";
const VALID_KEY = /^[A-Za-z0-9_-]{16,128}$/;

const storageKey = (userId: string) => `${SUBMISSION_KEY_PREFIX}_${userId}`;

/** The key for the pending submission: the saved one if present, else a new saved one. */
export async function getOrCreateSubmissionKey(store: KeyStore, userId: string, generate: () => string): Promise<string> {
  const saved = await store.getItemAsync(storageKey(userId)).catch(() => null);
  if (saved && VALID_KEY.test(saved)) return saved;
  const fresh = generate();
  if (!VALID_KEY.test(fresh)) throw new Error("Generated submission key is not valid.");
  await store.setItemAsync(storageKey(userId), fresh);
  return fresh;
}

/** Forget the key: after a confirmed submission, or when the answers change. */
export async function clearSubmissionKey(store: KeyStore, userId: string): Promise<void> {
  await store.deleteItemAsync(storageKey(userId)).catch(() => undefined);
}
