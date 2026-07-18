// controllers/report.controller.js
import { pool } from "../config/db.js";
import admin from "../config/firebase.js";
import twilio from "twilio";
import {
  claimEmergencyCooldown,
  releaseEmergencyCooldown,
} from "../services/emergency-cooldown.service.js";
import { uploadImageToFirebase } from "../services/firebase-storage.service.js";
import { getNeighborhoodActivityRows } from "../services/neighborhood-activity.service.js";
import {
  createProtectedMediaUrl,
  requestOrigin,
} from "../services/protected-media.service.js";
import {
  deleteInvalidPushTokens,
  getNeighborhoodPushRecipients,
} from "../services/push-token.service.js";

const INVALID_FCM_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/mismatched-credential",
  "messaging/registration-token-not-registered",
]);

const normalizePhoneNumber = (value) => {
  if (!value) return "";

  let phone = String(value).trim().replace(/[\s().-]/g, "");

  if (phone.startsWith("00")) {
    phone = `+${phone.slice(2)}`;
  }

  if (phone.startsWith("+")) {
    return phone;
  }

  // Ecuador local formats: 09XXXXXXXX mobile or 0[2-7]XXXXXXX landline.
  if (/^09\d{8}$/.test(phone) || /^0[2-7]\d{7}$/.test(phone)) {
    return `+593${phone.slice(1)}`;
  }

  if (/^593\d{8,9}$/.test(phone)) {
    return `+${phone}`;
  }

  return phone;
};

const isE164PhoneNumber = (value) => /^\+[1-9]\d{7,14}$/.test(value);

const twilioStatusFromError = (errorCode) => {
  switch (String(errorCode || "")) {
    case "20003":
      return "twilio_auth_failed";
    case "21211":
      return "invalid_alarm_number";
    case "21212":
    case "21606":
      return "invalid_twilio_from";
    case "21608":
      return "unverified_alarm_number";
    default:
      return "failed";
  }
};

const addErrorCode = (target, code, count = 1) => {
  const key = code || "unknown";
  target[key] = (target[key] || 0) + count;
};


const protectReportRows = (rows, req) => {
  const origin = requestOrigin(req);
  return Promise.all(
    rows.map(async (report) => ({
      ...report,
      image_url: await createProtectedMediaUrl(report.image_url, { origin }),
    })),
  );
};
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
const TWILIO_FROM_NUMBER = normalizePhoneNumber(
  process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE,
);
const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

// =============================================
// REPORTES DE ACTIVIDAD SOSPECHOSA (sin sirena)
// =============================================
export const createReport = async (req, res) => {
  let uploadedFile = null;

  try {
    const {
      id: user_id,
      neighborhood: neighborhood_id,
      role,
      name,
      last_name,
    } = req.user;

    if (![2, 3].includes(Number(role))) {
      return res
        .status(403)
        .json({ message: "Solo los miembros del barrio pueden crear reportes." });
    }

    const { title, description } = req.body;

    if (!neighborhood_id) {
      return res
        .status(400)
        .json({ message: "Tu usuario no tiene barrio asignado." });
    }

    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "title y description son obligatorios." });
    }

    if (String(title).trim().length > 100) {
      return res
        .status(400)
        .json({ message: "El título no puede superar 100 caracteres." });
    }

    // ✅ Subir imagen a Firebase Storage sin getSignedUrl
    let image_url = null;
    let imageUploadWarning = req.uploadWarning || null;

    if (req.file) {
      try {
        const uploadResult = await uploadImageToFirebase({
          upload: req.file,
          folder: "reports",
          prefix: "evidencia",
        });
        image_url = uploadResult.imageUrl;
        uploadedFile = uploadResult.storageFile;
      } catch (uploadError) {
        imageUploadWarning = {
          code: "evidence_upload_failed",
          message:
            "El reporte se registró, pero Firebase Storage no aceptó la evidencia.",
        };
        console.error("Evidencia omitida del reporte:", {
          code: uploadError.code,
          message: uploadError.message,
          details: uploadError.details,
        });
      }
    }
    const avisoFoto = image_url ? "\n📸 Evidencia adjunta" : "";
    const alertMessage = `⚠️ ACTIVIDAD SOSPECHOSA ⚠️
Motivo: ${String(title).trim()}
Detalle: ${String(description).trim()}${avisoFoto}`;

    const { rows } = await pool.query(
      `WITH new_report AS (
         INSERT INTO reports
           (user_id, neighborhood_id, title, description, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING report_id, user_id, neighborhood_id, title, description, image_url, created_at
       ),
       new_chat AS (
         INSERT INTO chat_messages
           (user_id, neighborhood_id, message, image_url, created_at)
         VALUES ($1, $2, $6, $5, NOW())
         RETURNING message_id, message, image_url, created_at
       )
       SELECT r.*,
              c.message_id AS chat_message_id,
              c.message AS chat_message,
              c.image_url AS chat_image_url,
              c.created_at AS chat_created_at
       FROM new_report r
       CROSS JOIN new_chat c`,
      [
        user_id,
        neighborhood_id,
        String(title).trim(),
        String(description).trim(),
        image_url,
        alertMessage,
      ],
    );
    const io = req.app.get("io");
    if (io) {
      const protectedImageUrl = await createProtectedMediaUrl(
        rows[0].chat_image_url,
        { origin: requestOrigin(req) },
      );
      io.to(`neighborhood_${neighborhood_id}`).emit("new_message", {
        message_id: rows[0].chat_message_id,
        message: rows[0].chat_message,
        image_url: protectedImageUrl,
        created_at: rows[0].chat_created_at,
        user_id: user_id,
        name: name,
        last_name: last_name || null,
        neighborhood_id: neighborhood_id,
      });
    }

    // Las notificaciones son complementarias y nunca deben bloquear el registro.
    let usersQuery = { rows: [] };
    let pushLookupError = null;
    try {
      usersQuery = await getNeighborhoodPushRecipients(
        neighborhood_id,
        user_id,
      );
    } catch (pushError) {
      pushLookupError = pushError;
      console.error(
        "No se pudieron consultar destinatarios push; el registro principal continuará:",
        pushError,
      );
    }
    const tokens = usersQuery.rows.map((row) => row.fcm_token);

    if (tokens.length > 0) {
      const alertTitle = "⚠️ Actividad Sospechosa";
      const alertBody = String(title).trim();

      const payload = {
        notification: {
          title: alertTitle,
          body: alertBody,
        },
        data: {
          type: "report",
          activity_id: `report-${rows[0].report_id}`,
          report_id: String(rows[0].report_id),
        },
        android: { priority: "high", notification: { sound: "default" } },
        apns: { payload: { aps: { sound: "default" } } },
        tokens: tokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log("Notificaciones push enviadas:", response.successCount);

        const newReportId = rows[0].report_id;

        const recipientIds = [
          ...new Set(usersQuery.rows.map((row) => row.user_id)),
        ];

        for (const receiverId of recipientIds) {
          await pool.query(
            `INSERT INTO notifications (report_id, receiver_id, message, is_read, created_at)
             VALUES ($1, $2, $3, false, NOW())`,
            [newReportId, receiverId, alertBody],
          );
        }
        console.log(
          "Historial guardado en la tabla notifications correctamente.",
        );
      } catch (pushError) {
        console.error("Error procesando notificaciones:", pushError);
      }
    }

    const userResult = await pool.query(
      `SELECT address FROM users WHERE user_id = $1`,
      [user_id],
    );
    const reportData = rows[0];
    reportData.address = userResult.rows[0]?.address || null;
    reportData.image_url = await createProtectedMediaUrl(reportData.image_url, {
      origin: requestOrigin(req),
    });

    res.status(201).json({
      message: "Reporte de actividad sospechosa creado",
      report: reportData,
      warnings: [
        imageUploadWarning,
        pushLookupError
          ? {
              code: "push_unavailable",
              message:
                "El reporte se registró, pero no se pudieron procesar las notificaciones.",
            }
          : null,
      ].filter(Boolean),
    });
  } catch (err) {
    if (uploadedFile) {
      await uploadedFile.delete({ ignoreNotFound: true }).catch((cleanupError) => {
        console.error("No se pudo limpiar la imagen del reporte:", cleanupError);
      });
    }
    console.error("Error creando reporte:", err);
    res.status(500).json({ message: "No se pudo crear el reporte." });
  }
};

// =============================================
// EMERGENCIA REAL (activa sirena + llamada Twilio)
// =============================================
export const triggerEmergency = async (req, res) => {
  let evidenceFile = null;
  let cooldownClaimed = false;
  let emergencyRecorded = false;
  let cooldownUserId = null;
  let cooldownNeighborhoodId = null;

  try {
    const {
      id: user_id,
      neighborhood: neighborhood_id,
      role,
      name,
      last_name,
    } = req.user;

    if (![2, 3].includes(Number(role))) {
      return res
        .status(403)
        .json({ message: "Solo los miembros del barrio pueden activar emergencias." });
    }

    if (!neighborhood_id) {
      return res
        .status(400)
        .json({ message: "Tu usuario no tiene barrio asignado." });
    }

    const { justification } = req.body;

    if (!justification || String(justification).trim().length === 0) {
      return res
        .status(400)
        .json({ message: "Debes indicar el motivo de la emergencia." });
    }

    if (String(justification).trim().length > 200) {
      return res
        .status(400)
        .json({ message: "El motivo no puede superar 200 caracteres." });
    }

    const neighborhoodQuery = await pool.query(
      `SELECT alarm_number, name FROM neighborhoods WHERE neighborhood_id = $1`,
      [neighborhood_id],
    );

    if (neighborhoodQuery.rows.length === 0) {
      return res.status(404).json({ message: "Barrio no encontrado." });
    }

    const rawAlarmNumber = neighborhoodQuery.rows[0].alarm_number;
    const alarmNumber = normalizePhoneNumber(rawAlarmNumber);
    const hasAlarmNumber = Boolean(
      rawAlarmNumber && String(rawAlarmNumber).trim(),
    );
    const alarmNumberIsValid = isE164PhoneNumber(alarmNumber);
    const twilioIsConfigured = Boolean(
      twilioClient &&
        TWILIO_FROM_NUMBER &&
        isE164PhoneNumber(TWILIO_FROM_NUMBER),
    );
    const twilioConfigurationErrors = [
      !TWILIO_ACCOUNT_SID ? "missing_account_sid" : null,
      !TWILIO_AUTH_TOKEN ? "missing_auth_token" : null,
      !TWILIO_FROM_NUMBER
        ? "missing_from_number"
        : !isE164PhoneNumber(TWILIO_FROM_NUMBER)
          ? "invalid_from_number"
          : null,
    ].filter(Boolean);
    const neighborhoodName = neighborhoodQuery.rows[0].name;

    const userQuery = await pool.query(
      `SELECT home_lat, home_lng, address FROM users WHERE user_id = $1`,
      [user_id],
    );

    const homeLat = userQuery.rows[0]?.home_lat;
    const homeLng = userQuery.rows[0]?.home_lng;
    const userAddress = userQuery.rows[0]?.address || "";

    const retryAfter = await claimEmergencyCooldown(user_id, neighborhood_id);
    if (retryAfter > 0) {
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: `Espera ${retryAfter} segundos antes de activar otra emergencia.`,
        retry_after_seconds: retryAfter,
      });
    }

    cooldownClaimed = true;
    cooldownUserId = user_id;
    cooldownNeighborhoodId = neighborhood_id;

    const addressText = userAddress ? `\nDirección: ${userAddress}` : "";
    const locationTag = homeLat && homeLng ? `\n[LOCATION:${homeLat},${homeLng}]` : "";

    // ✅ Subir imagen de emergencia a Firebase Storage sin getSignedUrl
    let evidence_url = null;
    let evidenceUploadWarning = req.uploadWarning || null;

    if (req.file) {
      try {
        const uploadResult = await uploadImageToFirebase({
          upload: req.file,
          folder: "emergencias",
          prefix: "evidencia",
        });
        evidence_url = uploadResult.imageUrl;
        evidenceFile = uploadResult.storageFile;
      } catch (uploadError) {
        evidenceUploadWarning = {
          code: "evidence_upload_failed",
          message:
            "La emergencia se registró sin evidencia porque Firebase Storage rechazó la imagen.",
        };
        console.error("Evidencia omitida de la emergencia:", {
          code: uploadError.code,
          message: uploadError.message,
          details: uploadError.details,
        });
      }
    }
    const evidenceTag = evidence_url ? "" : "\n[NO_EVIDENCE]";
    const alertMessage = `🚨 ¡EMERGENCIA ACTIVADA! 🚨\nMotivo: ${String(justification).trim()}\nVecino: ${name} ${last_name || ""}${addressText}${locationTag}${evidenceTag}`;

    const chatResult = await pool.query(
      `INSERT INTO chat_messages (user_id, neighborhood_id, message, image_url, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING message_id, message, image_url, created_at`,
      [user_id, neighborhood_id, alertMessage, evidence_url],
    );
    emergencyRecorded = true;

    const io = req.app.get("io");
    if (io) {
      const protectedImageUrl = await createProtectedMediaUrl(
        chatResult.rows[0].image_url,
        { origin: requestOrigin(req) },
      );
      io.to(`neighborhood_${neighborhood_id}`).emit("new_message", {
        message_id: chatResult.rows[0].message_id,
        message: chatResult.rows[0].message,
        image_url: protectedImageUrl,
        created_at: chatResult.rows[0].created_at,
        user_id: user_id,
        name: name,
        last_name: last_name || null,
        neighborhood_id: neighborhood_id,
      });
    }

    // Las notificaciones son complementarias y nunca deben bloquear el registro.
    let usersQuery = { rows: [] };
    let pushLookupError = null;
    try {
      usersQuery = await getNeighborhoodPushRecipients(
        neighborhood_id,
        user_id,
      );
    } catch (pushError) {
      pushLookupError = pushError;
      console.error(
        "No se pudieron consultar destinatarios push; el registro principal continuará:",
        pushError,
      );
    }
    const tokens = usersQuery.rows.map((row) => row.fcm_token);
    const delivery = {
      chat: {
        created: true,
        message_id: chatResult.rows[0].message_id,
      },
      evidence: {
        requested: Boolean(req.file || req.uploadWarning),
        attached: Boolean(evidence_url),
        status: req.file
          ? evidence_url
            ? "uploaded"
            : "failed"
          : "not_provided",
        warning: evidenceUploadWarning,
      },
      push: {
        attempted: tokens.length,
        success: 0,
        failure: 0,
        invalidated: 0,
        error_codes: pushLookupError ? { push_token_lookup_failed: 1 } : {},
        status: pushLookupError
          ? "unavailable"
          : tokens.length > 0
            ? "pending"
            : "no_recipients",
      },
      twilio: {
        attempted: false,
        configured: twilioIsConfigured,
        configuration_errors: twilioConfigurationErrors,
        status: hasAlarmNumber
          ? alarmNumberIsValid
            ? "pending"
            : "invalid_alarm_number"
          : "no_alarm_number",
      },
    };

    if (tokens.length > 0) {
      const payload = {
        notification: {
          title: "🚨 ¡EMERGENCIA en tu barrio!",
          body: `${name}: ${String(justification).trim()}`,
        },
        data: {
          type: "emergency",
          activity_id: `emergency-${chatResult.rows[0].message_id}`,
          message_id: String(chatResult.rows[0].message_id),
        },
        android: { priority: "high", notification: { sound: "default" } },
        apns: { payload: { aps: { sound: "default" } } },
        tokens: tokens,
      };

      try {
        const invalidTokens = new Set();

        for (let i = 0; i < tokens.length; i += 500) {
          const chunkRows = usersQuery.rows.slice(i, i + 500);
          const response = await admin.messaging().sendEachForMulticast({
            ...payload,
            tokens: chunkRows.map((row) => row.fcm_token),
          });
          delivery.push.success += response.successCount;
          delivery.push.failure += response.failureCount;

          response.responses.forEach((sendResult, index) => {
            if (sendResult.success) return;

            const errorCode = sendResult.error?.code || "unknown";
            addErrorCode(delivery.push.error_codes, errorCode);

            if (INVALID_FCM_ERROR_CODES.has(errorCode)) {
              invalidTokens.add(chunkRows[index].fcm_token);
            }
          });
        }

        if (invalidTokens.size > 0) {
          await deleteInvalidPushTokens([...invalidTokens]);
          delivery.push.invalidated = invalidTokens.size;
        }

        delivery.push.status =
          delivery.push.failure === 0
            ? "sent"
            : delivery.push.success === 0
              ? "failed"
              : "partially_sent";
        console.log(
          "Notificaciones de emergencia enviadas:",
          delivery.push.success,
        );
      } catch (pushError) {
        console.error("Error enviando notificaciones de emergencia:", pushError);
        delivery.push.status = "failed";
        delivery.push.failure = tokens.length;
        addErrorCode(delivery.push.error_codes, pushError.code);
      }
    }

    // Activar sirena física mediante LLAMADA DE VOZ (Twilio Voice)
    if (hasAlarmNumber && !alarmNumberIsValid) {
      console.warn(
        "El numero de alarma del barrio no tiene formato E.164 valido.",
      );
    } else if (alarmNumber && twilioIsConfigured) {
      try {
        console.log(`📞 Llamando a la sirena del barrio ${neighborhoodName}`);
        const voiceResponse = new twilio.twiml.VoiceResponse();
        voiceResponse.say(
          { language: "es-MX" },
          `Alerta de emergencia activada en el barrio ${neighborhoodName}. Emergencia reportada por ${name}.`,
        );
        voiceResponse.pause({ length: 2 });
        voiceResponse.say(
          { language: "es-MX" },
          "Alerta de emergencia activada.",
        );

        const call = await twilioClient.calls.create({
          twiml: voiceResponse.toString(),
          from: TWILIO_FROM_NUMBER,
          to: alarmNumber,
        });
        delivery.twilio.attempted = true;
        delivery.twilio.status = call.status || "queued";
        delivery.twilio.call_sid = call.sid;
        console.log("🔊 ¡Llamada realizada a la sirena! ID:", call.sid);
      } catch (twilioError) {
        console.error(
          "❌ Falló la llamada a la alarma:",
          twilioError.message,
        );
        delivery.twilio.attempted = true;
        delivery.twilio.status = twilioStatusFromError(twilioError.code);
        delivery.twilio.error_code = twilioError.code || null;
      }
    } else if (hasAlarmNumber) {
      delivery.twilio.status = "not_configured";
      console.warn(
        "Twilio no esta configurado. Define TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_PHONE.",
      );
    } else {
      console.warn("⚠️ Este barrio no tiene número de alarma configurado.");
    }

    res
      .status(201)
      .json({ message: "Emergencia activada correctamente", delivery });
  } catch (err) {
    if (cooldownClaimed && !emergencyRecorded) {
      await releaseEmergencyCooldown(cooldownUserId, cooldownNeighborhoodId);
    }
    if (evidenceFile && !emergencyRecorded) {
      await evidenceFile.delete({ ignoreNotFound: true }).catch((cleanupError) => {
        console.error("No se pudo limpiar la evidencia de emergencia:", cleanupError);
      });
    }
    console.error("Error en triggerEmergency:", err);
    res.status(500).json({ message: "No se pudo activar la emergencia." });
  }
};

// =============================================
// CONSULTAS DE REPORTES (sin cambios)
// =============================================
export const getAllReports = async (req, res) => {
  try {
    const { role, neighborhood: neighborhood_id } = req.user;

    if (Number(role) !== 1 && Number(role) !== 2) {
      return res
        .status(403)
        .json({ message: "No autorizado para ver todos los reportes." });
    }

    const values = [];
    let neighborhoodFilter = "";

    if (Number(role) === 2) {
      if (!neighborhood_id) {
        return res
          .status(400)
          .json({ message: "Tu administrador no tiene barrio asignado." });
      }
      neighborhoodFilter = "WHERE r.neighborhood_id = $1";
      values.push(neighborhood_id);
    }

    const { rows } = await pool.query(
      `SELECT r.report_id,
              r.neighborhood_id,
              r.title,
              r.description,
              r.image_url,
              r.created_at,
              u.user_id,
              u.name,
              u.last_name
       FROM reports r
       INNER JOIN users u ON u.user_id = r.user_id
       ${neighborhoodFilter}
       ORDER BY r.created_at DESC`,
      values,
    );

    res.json(await protectReportRows(rows, req));
  } catch (err) {
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

export const getNeighborhoodReports = async (req, res) => {
  try {
    const { neighborhood: neighborhood_id, role } = req.user;

    if (Number(role) === 3 && !neighborhood_id) {
      return res
        .status(400)
        .json({ message: "Tu usuario no tiene barrio asignado." });
    }

    const { rows } = await pool.query(
      `SELECT r.report_id,
              r.title,
              r.description,
              r.image_url,
              r.created_at,
              u.user_id,
              u.name,
              u.last_name,
              u.address
       FROM reports r
       INNER JOIN users u ON u.user_id = r.user_id
       WHERE r.neighborhood_id = $1
       ORDER BY r.created_at DESC`,
      [neighborhood_id],
    );

    res.json(await protectReportRows(rows, req));
  } catch (err) {
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

export const getNeighborhoodActivity = async (req, res) => {
  try {
    const { neighborhood: neighborhood_id } = req.user;

    if (!neighborhood_id) {
      return res
        .status(400)
        .json({ message: "Tu usuario no tiene barrio asignado." });
    }

    const activity = await getNeighborhoodActivityRows(
      neighborhood_id,
      requestOrigin(req),
    );
    res.json(activity);
  } catch (error) {
    console.error("Error consultando actividad del barrio:", error);
    res
      .status(500)
      .json({ message: "No se pudo cargar la actividad del barrio." });
  }
};

export const getMyReports = async (req, res) => {
  try {
    const { id: user_id } = req.user;

    const { rows } = await pool.query(
      `SELECT r.report_id, r.neighborhood_id, r.title, r.description, r.image_url, r.created_at, u.address
       FROM reports r
       INNER JOIN users u ON u.user_id = r.user_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [user_id],
    );

    res.json(await protectReportRows(rows, req));
  } catch (err) {
    res.status(500).json({ message: "Error interno del servidor." });
  }
};
