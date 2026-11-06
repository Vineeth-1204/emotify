import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { clearSubmissionKey, getOrCreateSubmissionKey, SUBMISSION_KEY_PREFIX, type KeyStore } from "./screeningSubmissionKey";

function memoryStore(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => void data.set(k, v),
    deleteItemAsync: async (k) => void data.delete(k),
  };
}

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("screening submission key lifecycle", () => {
  test("created once and reused for every retry of the same submission", async () => {
    const store = memoryStore();
    const first = await getOrCreateSubmissionKey(store, "user1", uuid);
    expect(await getOrCreateSubmissionKey(store, "user1", uuid)).toBe(first);
    expect(await getOrCreateSubmissionKey(store, "user1", uuid)).toBe(first);
    expect(store.data.get(`${SUBMISSION_KEY_PREFIX}_user1`)).toBe(first);
  });

  test("cleared after confirmation (or when answers change), so the next check-in gets a new key", async () => {
    const store = memoryStore();
    const first = await getOrCreateSubmissionKey(store, "user1", uuid);
    await clearSubmissionKey(store, "user1");
    const next = await getOrCreateSubmissionKey(store, "user1", uuid);
    expect(next).not.toBe(first);
  });

  test("keys are per user on a shared device", async () => {
    const store = memoryStore();
    const a = await getOrCreateSubmissionKey(store, "userA", uuid);
    const b = await getOrCreateSubmissionKey(store, "userB", uuid);
    expect(a).not.toBe(b);
    await clearSubmissionKey(store, "userA");
    expect(await getOrCreateSubmissionKey(store, "userB", uuid)).toBe(b);
  });

  test("a corrupted saved key is replaced; an invalid generated key is refused", async () => {
    const store = memoryStore();
    store.data.set(`${SUBMISSION_KEY_PREFIX}_user1`, "bad key");
    const key = await getOrCreateSubmissionKey(store, "user1", uuid);
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    await expect(getOrCreateSubmissionKey(memoryStore(), "user2", () => "short")).rejects.toThrow(/not valid/);
  });

  test("storage read failures fall back to a fresh key instead of blocking submission", async () => {
    const store = memoryStore();
    store.getItemAsync = async () => {
      throw new Error("keychain locked");
    };
    expect(await getOrCreateSubmissionKey(store, "user1", uuid)).toMatch(/^0{8}-/);
  });

  test("the screening screen reuses the key on retry, clears it on answer change and after success", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../app/(auth)/screening.tsx"), "utf-8");
    expect(src).toContain("getOrCreateSubmissionKey(SecureStore, user.id, () => Crypto.randomUUID())");
    expect(src).toMatch(/submissionKey/);
    const persist = src.slice(src.indexOf("persistAnswers"), src.indexOf("persistAnswers") + 800);
    expect(persist).toContain("clearSubmissionKey");
    const afterSubmit = src.slice(src.indexOf("await submitScreeningAttempt("));
    expect(afterSubmit.indexOf("clearSubmissionKey")).toBeGreaterThan(0);
    expect(afterSubmit.indexOf("clearSubmissionKey")).toBeLessThan(afterSubmit.indexOf('router.replace("/(auth)/screening-result"'));
    // The key is not cleared on failure: the catch block must not call clearSubmissionKey.
    const failure = afterSubmit.slice(afterSubmit.indexOf("} catch (error) {"), afterSubmit.indexOf("} catch (error) {") + 400);
    expect(failure).not.toContain("clearSubmissionKey");
  });
});
