import * as functions from "firebase-functions";
import { FieldValue, Timestamp } from "@google-cloud/firestore";
import { db } from "./firestoreAdmin";

/**
 * Firestore-backed per-UID tumbling-window rate limiter.
 *
 * Counter documents live at:
 *   rateLimits/{uid}/{functionName}/{windowKey}
 *
 * Each counter document contains:
 *   { count: number; expiresAt: Timestamp; windowKey: string; uid: string }
 *
 * The window key is derived from Math.floor(Date.now() / windowMs) so
 * counters automatically "roll over" when the window boundary is crossed —
 * no background cleanup is needed for correctness. Expired counter docs
 * accumulate over time; add a scheduled cleanup function in production.
 *
 * Throws `resource-exhausted` HttpsError when the limit is reached.
 */
export async function checkRateLimit(
  uid: string,
  functionName: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const windowKey = String(Math.floor(Date.now() / windowMs));
  const counterRef = db
    .collection("rateLimits")
    .doc(uid)
    .collection(functionName)
    .doc(windowKey);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);

    if (!snap.exists) {
      // First request in this window — create the counter
      tx.set(counterRef, {
        count: 1,
        // Retain for two window lengths so the previous window is still
        // observable during overlap. A production cleanup job can use
        // expiresAt to find and delete stale docs.
        expiresAt: Timestamp.fromMillis(Date.now() + windowMs * 2),
        windowKey,
        uid,
      });
      return;
    }

    const data = snap.data()!;
    if ((data.count as number) >= limit) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Rate limit exceeded. Try again later.`
      );
    }

    tx.update(counterRef, { count: FieldValue.increment(1) });
  });
}
