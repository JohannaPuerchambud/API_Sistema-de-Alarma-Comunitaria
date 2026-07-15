import admin from "../config/firebase.js";
import {
  deleteInvalidPushTokens,
  getNeighborhoodPushRecipients,
} from "./push-token.service.js";

const INVALID_FCM_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/mismatched-credential",
  "messaging/registration-token-not-registered",
]);

const incrementError = (errors, code) => {
  const key = code || "unknown";
  errors[key] = (errors[key] || 0) + 1;
};

export const sendNeighborhoodPush = async ({
  neighborhoodId,
  excludeUserId,
  title,
  body,
  data = {},
}) => {
  const recipients = await getNeighborhoodPushRecipients(
    neighborhoodId,
    excludeUserId,
  );

  const delivery = {
    attempted: recipients.rows.length,
    success: 0,
    failure: 0,
    invalidated: 0,
    error_codes: {},
    status: recipients.rows.length > 0 ? "pending" : "no_recipients",
  };

  if (recipients.rows.length === 0) return delivery;

  const invalidTokens = new Set();

  for (let index = 0; index < recipients.rows.length; index += 500) {
    const chunk = recipients.rows.slice(index, index + 500);
    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, String(value)]),
      ),
      android: {
        priority: "high",
        notification: { sound: "default" },
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
      tokens: chunk.map((row) => row.fcm_token),
    });

    delivery.success += response.successCount;
    delivery.failure += response.failureCount;

    response.responses.forEach((result, responseIndex) => {
      if (result.success) return;

      const errorCode = result.error?.code || "unknown";
      incrementError(delivery.error_codes, errorCode);
      if (INVALID_FCM_ERROR_CODES.has(errorCode)) {
        invalidTokens.add(chunk[responseIndex].fcm_token);
      }
    });
  }

  if (invalidTokens.size > 0) {
    await deleteInvalidPushTokens([...invalidTokens]);
    delivery.invalidated = invalidTokens.size;
  }

  delivery.status =
    delivery.failure === 0
      ? "sent"
      : delivery.success === 0
        ? "failed"
        : "partially_sent";

  return delivery;
};