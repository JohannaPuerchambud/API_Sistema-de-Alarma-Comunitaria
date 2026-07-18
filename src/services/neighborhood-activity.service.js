import { pool } from "../config/db.js";
import { createProtectedMediaUrl } from "./protected-media.service.js";

const EMERGENCY_MARKER = "EMERGENCIA ACTIVADA";
const LOCATION_PATTERN = /\[LOCATION:([-\d.]+),([-\d.]+)\]/;

const lineValue = (message, label) => {
  const pattern = new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]+)`, "i");
  return message.match(pattern)?.[1]?.trim() || null;
};

export const parseEmergencyMessage = (message, fallbackAddress = null) => {
  const text = String(message || "");
  if (!text.includes(EMERGENCY_MARKER)) return null;

  const locationMatch = text.match(LOCATION_PATTERN);

  return {
    title: "Emergencia",
    description: lineValue(text, "Motivo") || "Emergencia reportada",
    address: lineValue(text, "Dirección") || fallbackAddress || null,
    latitude: locationMatch ? Number(locationMatch[1]) : null,
    longitude: locationMatch ? Number(locationMatch[2]) : null,
  };
};

export const getNeighborhoodActivityRows = async (neighborhoodId, mediaOrigin) => {
  const [reportResult, emergencyResult] = await Promise.all([
    pool.query(
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
       WHERE r.neighborhood_id = $1`,
      [neighborhoodId],
    ),
    pool.query(
      `SELECT cm.message_id,
              cm.message,
              cm.image_url,
              cm.created_at,
              u.user_id,
              u.name,
              u.last_name,
              u.address
       FROM chat_messages cm
       INNER JOIN users u ON u.user_id = cm.user_id
       WHERE cm.neighborhood_id = $1
         AND cm.message LIKE $2`,
      [neighborhoodId, `%${EMERGENCY_MARKER}%`],
    ),
  ]);

  const reports = await Promise.all(reportResult.rows.map(async (row) => ({
    activity_id: `report-${row.report_id}`,
    source_id: Number(row.report_id),
    activity_type: "report",
    title: row.title,
    description: row.description,
    image_url: await createProtectedMediaUrl(row.image_url, {
      origin: mediaOrigin,
    }),
    created_at: row.created_at,
    user_id: Number(row.user_id),
    name: row.name,
    last_name: row.last_name,
    address: row.address,
    latitude: null,
    longitude: null,
  })));

  const emergencies = (await Promise.all(emergencyResult.rows.map(async (row) => {
    const parsed = parseEmergencyMessage(row.message, row.address);
    if (!parsed) return [];

    return [
      {
        activity_id: `emergency-${row.message_id}`,
        source_id: Number(row.message_id),
        activity_type: "emergency",
        title: parsed.title,
        description: parsed.description,
        image_url: await createProtectedMediaUrl(row.image_url, {
          origin: mediaOrigin,
        }),
        created_at: row.created_at,
        user_id: Number(row.user_id),
        name: row.name,
        last_name: row.last_name,
        address: parsed.address,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      },
    ];
  }))).flat();

  return [...reports, ...emergencies].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
};
