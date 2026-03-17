// controllers/report.controller.js
import { pool } from "../config/db.js";
import admin from "../config/firebase.js";
import twilio from "twilio";

const accountSid = 'ACdf15be05ec1cc45f867439ceb578a703';
const authToken = '68e28d60d3a4b8d3b06e314161e28fe8';
const twilioClient = twilio(accountSid, authToken);

const TWILIO_PHONE = '+19047529646'; 
const NUMERO_CHIP_ALARMA = '+593961662731'; 
const CLAVE_ALARMA = 'ACTIVAR'; 


export const createReport = async (req, res) => {
  try {
    const { id: user_id, neighborhood: neighborhood_id, role, name, last_name } = req.user;

    if (Number(role) !== 3) {
      return res.status(403).json({ message: "Solo el rol Usuario puede crear reportes." });
    }

    const { title, description, image_url } = req.body;

    if (!neighborhood_id) {
      return res.status(400).json({ message: "Tu usuario no tiene barrio asignado." });
    }

    if (!title || !description) {
      return res.status(400).json({ message: "title y description son obligatorios." });
    }

    if (String(title).trim().length > 100) {
      return res.status(400).json({ message: "El título no puede superar 100 caracteres." });
    }

    const { rows } = await pool.query(
      `INSERT INTO reports (user_id, neighborhood_id, title, description, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING report_id, user_id, neighborhood_id, title, description, image_url, created_at`,
      [user_id, neighborhood_id, String(title).trim(), String(description).trim(), image_url || null]
    );

    const avisoFoto = image_url ? '\n📸 [Evidencia Fotográfica Adjunta]' : '';
    const alertMessage = `🚨 ALERTA VECINAL 🚨\nMotivo: ${String(title).trim()}\nDetalle: ${String(description).trim()}${avisoFoto}`;

    const chatResult = await pool.query(
      `INSERT INTO chat_messages (user_id, neighborhood_id, message, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING message_id, message, created_at`,
      [user_id, neighborhood_id, alertMessage]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`neighborhood_${neighborhood_id}`).emit("new_message", {
        message_id: chatResult.rows[0].message_id,
        message: chatResult.rows[0].message,
        created_at: chatResult.rows[0].created_at,
        user_id: user_id,
        name: name,
        last_name: last_name || null,
        neighborhood_id: neighborhood_id,
      });
    }

    const usersQuery = await pool.query(
      `SELECT user_id, fcm_token FROM users 
       WHERE neighborhood_id = $1 AND fcm_token IS NOT NULL AND user_id != $2`,
      [neighborhood_id, user_id]
    );

    const tokens = usersQuery.rows.map(row => row.fcm_token);

    if (tokens.length > 0) {
      const alertTitle = "🚨 Alerta Comunitaria";
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
            [newReportId, row.user_id, alertBody]
          );
        }
        console.log("Historial guardado en la tabla notifications correctamente.");
      } catch (pushError) {
        console.error("Error procesando notificaciones:", pushError);
      }
    }

    try {
      console.log("Intentando activar sirena física en el poste...");
      const message = await twilioClient.messages.create({
        body: CLAVE_ALARMA,        
        from: TWILIO_PHONE,        
        to: NUMERO_CHIP_ALARMA     
      });
      console.log("🔊 ¡SMS enviado a la sirena! ID:", message.sid);
    } catch (twilioError) {
      console.error("❌ Falló el envío del SMS a la alarma:", twilioError.message);
    }

    const userResult = await pool.query(`SELECT address FROM users WHERE user_id = $1`, [user_id]);
    const reportData = rows[0];
    reportData.address = userResult.rows[0]?.address || null;

    res.status(201).json({ message: "Reporte creado y alarma activada", report: reportData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getNeighborhoodReports = async (req, res) => {
  try {
    const { neighborhood: neighborhood_id, role } = req.user;

    if (Number(role) === 3 && !neighborhood_id) {
      return res.status(400).json({ message: "Tu usuario no tiene barrio asignado." });
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
      [neighborhood_id]
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
      [user_id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};