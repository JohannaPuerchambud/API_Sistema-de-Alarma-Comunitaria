// controllers/report.controller.js
import { pool } from "../config/db.js";
import admin from "../config/firebase.js";
import twilio from "twilio";

const accountSid = "ACdf15be05ec1cc45f867439ceb578a703";
const authToken = "68e28d60d3a4b8d3b06e314161e28fe8";
const twilioClient = twilio(accountSid, authToken);

const TWILIO_PHONE = "+19047529646";

// =============================================
// REPORTES DE ACTIVIDAD SOSPECHOSA (sin sirena)
// =============================================
export const createReport = async (req, res) => {
  try {
    const {
      id: user_id,
      neighborhood: neighborhood_id,
      role,
      name,
      last_name,
    } = req.user;

    if (Number(role) !== 3) {
      return res
        .status(403)
        .json({ message: "Solo el rol Usuario puede crear reportes." });
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

    // ✅ Subir imagen a Firebase Storage desde el backend (si viene adjunta)
    let image_url = null;

    if (req.file) {
      try {
        const bucket = admin.storage().bucket();
        const fileName = `reports/evidencia_${Date.now()}_${req.file.originalname}`;
        const file = bucket.file(fileName);

        await file.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
          },
        });

        // Generar URL firmada (compatible con Uniform Bucket-Level Access)
        const [signedUrl] = await file.getSignedUrl({
          action: "read",
          expires: "01-01-2035",
        });
        image_url = signedUrl;
      } catch (uploadErr) {
        console.error("Error subiendo imagen a Firebase Storage:", uploadErr);
        return res
          .status(500)
          .json({ message: "Error al subir la imagen de evidencia." });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO reports (user_id, neighborhood_id, title, description, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING report_id, user_id, neighborhood_id, title, description, image_url, created_at`,
      [
        user_id,
        neighborhood_id,
        String(title).trim(),
        String(description).trim(),
        image_url,
      ],
    );

    const avisoFoto = image_url ? "\n📸 Evidencia adjunta" : "";
    const alertMessage = `⚠️ ACTIVIDAD SOSPECHOSA ⚠️\nMotivo: ${String(title).trim()}\nDetalle: ${String(description).trim()}${avisoFoto}`;

    const chatResult = await pool.query(
      `INSERT INTO chat_messages (user_id, neighborhood_id, message, image_url, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING message_id, message, image_url, created_at`,
      [user_id, neighborhood_id, alertMessage, image_url || null],
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`neighborhood_${neighborhood_id}`).emit("new_message", {
        message_id: chatResult.rows[0].message_id,
        message: chatResult.rows[0].message,
        image_url: chatResult.rows[0].image_url,
        created_at: chatResult.rows[0].created_at,
        user_id: user_id,
        name: name,
        last_name: last_name || null,
        neighborhood_id: neighborhood_id,
      });
    }

    // Notificaciones push a vecinos
    const usersQuery = await pool.query(
      `SELECT user_id, fcm_token FROM users 
       WHERE neighborhood_id = $1 AND fcm_token IS NOT NULL AND user_id != $2`,
      [neighborhood_id, user_id],
    );

    const tokens = usersQuery.rows.map((row) => row.fcm_token);

    if (tokens.length > 0) {
      const alertTitle = "⚠️ Actividad Sospechosa";
      const alertBody = String(title).trim();

      const payload = {
        notification: {
          title: alertTitle,
          body: alertBody,
        },
        tokens: tokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log("Notificaciones push enviadas:", response.successCount);

        const newReportId = rows[0].report_id;

        for (const row of usersQuery.rows) {
          await pool.query(
            `INSERT INTO notifications (report_id, receiver_id, message, is_read, created_at)
             VALUES ($1, $2, $3, false, NOW())`,
            [newReportId, row.user_id, alertBody],
          );
        }
        console.log(
          "Historial guardado en la tabla notifications correctamente.",
        );
      } catch (pushError) {
        console.error("Error procesando notificaciones:", pushError);
      }
    }

    // ✅ Ya NO se activa la sirena física en reportes de actividad sospechosa

    const userResult = await pool.query(
      `SELECT address FROM users WHERE user_id = $1`,
      [user_id],
    );
    const reportData = rows[0];
    reportData.address = userResult.rows[0]?.address || null;

    res
      .status(201)
      .json({
        message: "Reporte de actividad sospechosa creado",
        report: reportData,
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// =============================================
// EMERGENCIA REAL (activa sirena + llamada Twilio)
// =============================================
export const triggerEmergency = async (req, res) => {
  try {
    const {
      id: user_id,
      neighborhood: neighborhood_id,
      role,
      name,
      last_name,
    } = req.user;

    if (Number(role) !== 3) {
      return res
        .status(403)
        .json({ message: "Solo el rol Usuario puede activar emergencias." });
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

    // 1. Obtener el alarm_number del barrio
    const neighborhoodQuery = await pool.query(
      `SELECT alarm_number, name FROM neighborhoods WHERE neighborhood_id = $1`,
      [neighborhood_id],
    );

    if (neighborhoodQuery.rows.length === 0) {
      return res.status(404).json({ message: "Barrio no encontrado." });
    }

    const alarmNumber = neighborhoodQuery.rows[0].alarm_number;
    const neighborhoodName = neighborhoodQuery.rows[0].name;

    // 2. Obtener las coordenadas del domicilio registrado por el administrador
    const userQuery = await pool.query(
      `SELECT home_lat, home_lng, address FROM users WHERE user_id = $1`,
      [user_id],
    );

    const homeLat = userQuery.rows[0]?.home_lat;
    const homeLng = userQuery.rows[0]?.home_lng;
    const userAddress = userQuery.rows[0]?.address || "";

    // 3. Construir enlace de Google Maps con la ubicación del domicilio
    const addressText = userAddress ? `\nDirección: ${userAddress}` : "";
    const locationTag = homeLat && homeLng ? `\n[LOCATION:${homeLat},${homeLng}]` : "";

    // 4. Subir imagen de evidencia a Firebase Storage (si viene adjunta)
    let evidence_url = null;

    if (req.file) {
      try {
        const bucket = admin.storage().bucket();
        const fileName = `emergencias/evidencia_${Date.now()}_${req.file.originalname}`;
        const file = bucket.file(fileName);

        await file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
        });

        // Generar URL firmada (compatible con Uniform Bucket-Level Access)
        const [signedUrl] = await file.getSignedUrl({
          action: "read",
          expires: "01-01-2035",
        });
        evidence_url = signedUrl;
      } catch (uploadErr) {
        console.error("Error subiendo imagen de emergencia:", uploadErr);
        // No bloqueamos la emergencia por un fallo de imagen
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

    const io = req.app.get("io");
    if (io) {
      io.to(`neighborhood_${neighborhood_id}`).emit("new_message", {
        message_id: chatResult.rows[0].message_id,
        message: chatResult.rows[0].message,
        image_url: chatResult.rows[0].image_url,
        created_at: chatResult.rows[0].created_at,
        user_id: user_id,
        name: name,
        last_name: last_name || null,
        neighborhood_id: neighborhood_id,
      });
    }

    // 4. Notificaciones push a vecinos
    const usersQuery = await pool.query(
      `SELECT user_id, fcm_token FROM users 
       WHERE neighborhood_id = $1 AND fcm_token IS NOT NULL AND user_id != $2`,
      [neighborhood_id, user_id],
    );

    const tokens = usersQuery.rows.map((row) => row.fcm_token);

    if (tokens.length > 0) {
      const payload = {
        notification: {
          title: "🚨 ¡EMERGENCIA en tu barrio!",
          body: `${name}: ${String(justification).trim()}`,
        },
        tokens: tokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log("🔔 Notificaciones de emergencia enviadas:", response.successCount);
      } catch (pushError) {
        console.error("Error enviando notificaciones de emergencia:", pushError);
      }
    }

    // 5. Activar sirena física mediante LLAMADA DE VOZ (Twilio Voice)
    if (alarmNumber) {
      try {
        console.log(`📞 Llamando a la sirena del barrio ${neighborhoodName}: ${alarmNumber}`);
        const call = await twilioClient.calls.create({
          twiml: `<Response><Say language="es-MX">Alerta de emergencia activada en el barrio ${neighborhoodName}. Emergencia reportada por ${name}.</Say><Pause length="2"/><Say language="es-MX">Alerta de emergencia activada.</Say></Response>`,
          from: TWILIO_PHONE,
          to: alarmNumber,
        });
        console.log("🔊 ¡Llamada realizada a la sirena! ID:", call.sid);
      } catch (twilioError) {
        console.error(
          "❌ Falló la llamada a la alarma:",
          twilioError.message,
        );
      }
    } else {
      console.warn("⚠️ Este barrio no tiene número de alarma configurado.");
    }

    res
      .status(201)
      .json({ message: "Emergencia activada correctamente" });
  } catch (err) {
    console.error("Error en triggerEmergency:", err);
    res.status(500).json({ error: err.message });
  }
};

// =============================================
// CONSULTAS DE REPORTES (sin cambios)
// =============================================
export const getAllReports = async (req, res) => {
  try {
    const { role } = req.user;

    if (Number(role) !== 1 && Number(role) !== 2) {
      return res
        .status(403)
        .json({ message: "No autorizado para ver todos los reportes." });
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
       ORDER BY r.created_at DESC`,
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
