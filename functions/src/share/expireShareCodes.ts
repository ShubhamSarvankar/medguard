import * as functions from "firebase-functions";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Timestamp } = require("@google-cloud/firestore") as { Timestamp: typeof import("@google-cloud/firestore").Timestamp };
import { db, serverTimestamp } from "../lib/firestoreAdmin";
import { writeAuditLog } from "../audit/writeAuditLog";

export const expireShareCodes = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = Timestamp.now();

    const expiredCodes = await db
      .collection("shareCodes")
      .where("expiresAt", "<", now)
      .where("used", "==", false)
      .get();

    if (expiredCodes.empty) return;

    const systemTs = serverTimestamp();

    await Promise.all(
      expiredCodes.docs.map(async (codeDoc) => {
        const codeData = codeDoc.data() as { shareId: string; recordId: string };

        const batch = db.batch();

        batch.delete(db.collection("shareCodes").doc(codeDoc.id));

        batch.update(db.collection("shares").doc(codeData.shareId), {
          status: "expired",
        });

        await batch.commit();

        await writeAuditLog({
          actorUid: "system",
          actionType: "share.expire",
          recordId: codeData.recordId,
          shareId: codeData.shareId,
          metadata: { expiredCode: codeDoc.id },
        });
      })
    );
  });