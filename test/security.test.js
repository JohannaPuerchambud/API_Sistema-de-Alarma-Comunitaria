import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET ||= "test-secret";
process.env.NODE_ENV ||= "test";
process.env.EMERGENCY_COOLDOWN_SECONDS = "60";

const { pool } = await import("../src/config/db.js");
const { verifyToken, neighborhoodMember } = await import("../src/middlewares/auth.middleware.js");
const { createUser, updateUser, deleteUser } = await import(
  "../src/controllers/user.controller.js"
);
const { triggerEmergency } = await import(
  "../src/controllers/report.controller.js"
);
const { isAllowedChatImageUrl } = await import("../src/socket.js");
const { normalizeStorageBucket } = await import("../src/config/firebase.js");
const { parseEmergencyMessage } = await import(
  "../src/services/neighborhood-activity.service.js"
);
const { getNeighborhoodPushRecipients } = await import("../src/services/push-token.service.js");
const { updateNeighborhoodUsers, setNeighborhoodAdmin } = await import("../src/controllers/neighborhood.controller.js");
const { claimEmergencyCooldown, releaseEmergencyCooldown } = await import(
  "../src/services/emergency-cooldown.service.js"
);

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
  set(name, value) {
    this.headers[name] = value;
    return this;
  },
});

test("roles 2 y 3 pueden usar funciones comunitarias, pero el rol 1 no", () => {
  for (const role of [2, 3]) {
    const req = { user: { role } };
    const res = createResponse();
    let called = false;
    neighborhoodMember(req, res, () => { called = true; });
    assert.equal(called, true);
    assert.equal(res.statusCode, 200);
  }

  const req = { user: { role: 1 } };
  const res = createResponse();
  let called = false;
  neighborhoodMember(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});
test("la asignacion de habitantes reutiliza neighborhood_id dentro de una transaccion", async () => {
  const originalConnect = pool.connect;
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("FROM neighborhoods")) return { rows: [{ neighborhood_id: 12 }] };
      if (sql.includes("FROM users")) {
        return {
          rows: [
            { user_id: 31, role_id: 3, neighborhood_id: null },
            { user_id: 32, role_id: 3, neighborhood_id: null },
          ],
        };
      }
      if (sql.includes("UPDATE users")) return { rows: [] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    release() {},
  };
  pool.connect = async () => client;

  try {
    const res = createResponse();
    await updateNeighborhoodUsers(
      {
        params: { id: 12 },
        body: { action: "add", user_ids: [31, 32] },
        app: { get: () => null },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.user_ids, [31, 32]);
    assert.equal(queries.some(({ sql }) => sql === "COMMIT"), true);
    assert.equal(
      queries.some(({ sql }) => sql.includes("SET neighborhood_id = $1")),
      true,
    );
  } finally {
    pool.connect = originalConnect;
  }
});
test("promueve explicitamente un habitante a representante sin cambiar el esquema", async () => {
  const originalConnect = pool.connect;
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("FROM neighborhoods")) return { rows: [{ neighborhood_id: 12 }] };
      if (sql.includes("SELECT user_id, role_id FROM users")) {
        return { rows: [{ user_id: 31, role_id: 3 }] };
      }
      if (sql.includes("SELECT user_id") && sql.includes("role_id = 2")) return { rows: [] };
      if (sql.includes("UPDATE users")) return { rows: [] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    release() {},
  };
  pool.connect = async () => client;

  try {
    const res = createResponse();
    await setNeighborhoodAdmin(
      {
        params: { id: 12 },
        body: { admin_user_id: 31, promote: true },
        app: { get: () => null },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(
      queries.some(({ sql }) => sql.includes("role_id = 2 WHERE user_id = $2")),
      true,
    );
  } finally {
    pool.connect = originalConnect;
  }
});
test("verifyToken usa el rol y barrio actuales de la base de datos", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [
      {
        user_id: 7,
        name: "Vecino",
        last_name: null,
        email: "vecino@example.test",
        phone: null,
        address: null,
        role_id: 3,
        neighborhood_id: 9,
        neighborhood_name: "Barrio",
      },
    ],
  });

  try {
    const oldToken = jwt.sign(
      { id: 7, role: 1, neighborhood: 1 },
      process.env.JWT_SECRET,
    );
    const req = { headers: { authorization: `Bearer ${oldToken}` } };
    const res = createResponse();
    let called = false;

    await verifyToken(req, res, () => {
      called = true;
    });

    assert.equal(called, true);
    assert.equal(req.user.role, 3);
    assert.equal(req.user.neighborhood, 9);
  } finally {
    pool.query = originalQuery;
  }
});

test("un Admin Barrio no puede crear otro administrador", async () => {
  const res = createResponse();

  await createUser(
    {
      user: { role: 2, neighborhood: 4 },
      body: {
        name: "Prueba",
        email: "admin-barrio@example.test",
        password: "Segura123",
        role_id: 2,
        neighborhood_id: 4,
      },
    },
    res,
  );

  assert.equal(res.statusCode, 403);
});

test("un Admin Barrio no puede modificar ni eliminar administradores", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [{ neighborhood_id: 4, role_id: 2 }],
  });

  try {
    const updateRes = createResponse();
    await updateUser(
      {
        user: { role: 2, neighborhood: 4 },
        params: { id: 8 },
        body: {
          name: "Admin",
          email: "admin@example.test",
          role_id: 2,
          neighborhood_id: 4,
        },
      },
      updateRes,
    );

    const deleteRes = createResponse();
    await deleteUser(
      {
        user: { role: 2, neighborhood: 4 },
        params: { id: 8 },
      },
      deleteRes,
    );

    assert.equal(updateRes.statusCode, 403);
    assert.equal(deleteRes.statusCode, 403);
  } finally {
    pool.query = originalQuery;
  }
});

test("el cooldown bloquea una segunda emergencia inmediata", async () => {
  const originalQuery = pool.query;
  let claimed = false;

  pool.query = async (sql) => {
    const query = String(sql);

    if (query.includes("INSERT INTO emergency_cooldowns")) {
      if (claimed) return { rows: [] };
      claimed = true;
      return { rows: [{ expires_at: new Date() }] };
    }
    if (query.includes("SELECT GREATEST")) {
      return { rows: [{ retry_after_seconds: 60 }] };
    }
    if (query.includes("DELETE FROM emergency_cooldowns")) {
      claimed = false;
      return { rows: [] };
    }

    throw new Error("Consulta inesperada: " + query);
  };

  try {
    const first = await claimEmergencyCooldown(42, 3);
    const second = await claimEmergencyCooldown(42, 3);

    assert.equal(first, 0);
    assert.equal(second, 60);
  } finally {
    await releaseEmergencyCooldown(42, 3);
    pool.query = originalQuery;
  }
});

const installEmergencyQueryMock = ({ alarmNumber, messageId }) => {
  const originalQuery = pool.query;

  pool.query = async (sql) => {
    const query = String(sql);

    if (query.includes("SELECT alarm_number, name")) {
      return { rows: [{ alarm_number: alarmNumber, name: "Barrio Seguro" }] };
    }
    if (query.includes("SELECT home_lat, home_lng, address")) {
      return { rows: [{ home_lat: null, home_lng: null, address: null }] };
    }
    if (query.includes("INSERT INTO emergency_cooldowns")) {
      return { rows: [{ expires_at: new Date() }] };
    }
    if (query.includes("DELETE FROM emergency_cooldowns")) {
      return { rows: [] };
    }
    if (query.includes("INSERT INTO chat_messages")) {
      return {
        rows: [
          {
            message_id: messageId,
            message: "EMERGENCIA ACTIVADA",
            image_url: null,
            created_at: new Date(),
          },
        ],
      };
    }
    if (query.includes("FROM user_push_tokens")) {
      return { rows: [] };
    }

    throw new Error("Consulta inesperada: " + query);
  };

  return originalQuery;
};

test("la emergencia informa resultados verificables de entrega", async () => {
  const originalQuery = installEmergencyQueryMock({
    alarmNumber: null,
    messageId: 55,
  });

  try {
    const res = createResponse();
    await triggerEmergency(
      {
        user: {
          id: 901,
          role: 3,
          neighborhood: 77,
          name: "Vecino",
          last_name: "Prueba",
        },
        body: { justification: "Prueba controlada" },
        file: null,
        app: { get: () => null },
      },
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.delivery.chat.created, true);
    assert.equal(res.payload.delivery.push.status, "no_recipients");
    assert.equal(res.payload.delivery.twilio.status, "no_alarm_number");
  } finally {
    await releaseEmergencyCooldown(901, 77);
    pool.query = originalQuery;
  }
});

test("la emergencia no llama a Twilio con un numero de alarma invalido", async () => {
  const originalQuery = installEmergencyQueryMock({
    alarmNumber: "12345",
    messageId: 56,
  });

  try {
    const res = createResponse();
    await triggerEmergency(
      {
        user: {
          id: 902,
          role: 3,
          neighborhood: 78,
          name: "Vecino",
          last_name: "Prueba",
        },
        body: { justification: "Prueba controlada" },
        file: null,
        app: { get: () => null },
      },
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.delivery.chat.created, true);
    assert.equal(res.payload.delivery.twilio.status, "invalid_alarm_number");
    assert.equal(res.payload.delivery.twilio.attempted, false);
  } finally {
    await releaseEmergencyCooldown(902, 78);
    pool.query = originalQuery;
  }
});
test("el chat acepta URLs persistentes del bucket Firebase configurado", () => {
  assert.equal(
    isAllowedChatImageUrl(
      "https://firebasestorage.googleapis.com/v0/b/alarmacomunitaria-utn-5e6be.firebasestorage.app/o/chat_images%2Ffoto.jpg?alt=media&token=test-token",
    ),
    true,
  );
});

test("el chat mantiene compatibilidad con URLs firmadas anteriores", () => {
  assert.equal(
    isAllowedChatImageUrl(
      "https://storage.googleapis.com/alarmacomunitaria-utn-5e6be.firebasestorage.app/chat_images/foto.jpg?X-Goog-Signature=test",
    ),
    true,
  );
});

test("el chat rechaza imágenes externas y buckets ajenos", () => {
  assert.equal(
    isAllowedChatImageUrl("https://example.com/foto.jpg"),
    false,
  );
  assert.equal(
    isAllowedChatImageUrl(
      "https://firebasestorage.googleapis.com/v0/b/otro-bucket/o/foto.jpg?alt=media&token=test",
    ),
    false,
  );
});
test("normaliza formatos comunes del bucket Firebase", () => {
  assert.equal(
    normalizeStorageBucket(
      "gs://alarmacomunitaria-utn-5e6be.firebasestorage.app/",
    ),
    "alarmacomunitaria-utn-5e6be.firebasestorage.app",
  );
  assert.equal(
    normalizeStorageBucket(
      "https://firebasestorage.googleapis.com/v0/b/alarmacomunitaria-utn-5e6be.firebasestorage.app/o/",
    ),
    "alarmacomunitaria-utn-5e6be.firebasestorage.app",
  );
});

test("el cooldown usa memoria si la tabla auxiliar no existe", async () => {
  const originalQuery = pool.query;
  pool.query = async () => {
    const error = new Error("relation does not exist");
    error.code = "42P01";
    throw error;
  };

  try {
    const first = await claimEmergencyCooldown(1201, 91);
    const second = await claimEmergencyCooldown(1201, 91);
    assert.equal(first, 0);
    assert.ok(second > 0);
  } finally {
    await releaseEmergencyCooldown(1201, 91);
    pool.query = originalQuery;
  }
});

test("los tokens push usan users.fcm_token si falta la tabla auxiliar", async () => {
  const originalQuery = pool.query;
  let attempts = 0;
  pool.query = async (sql) => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("relation does not exist");
      error.code = "42P01";
      throw error;
    }

    assert.match(String(sql), /FROM users/);
    return { rows: [{ user_id: 77, fcm_token: "token-compatible" }] };
  };

  try {
    const result = await getNeighborhoodPushRecipients(12, 99);
    assert.deepEqual(result.rows, [
      { user_id: 77, fcm_token: "token-compatible" },
    ]);
  } finally {
    pool.query = originalQuery;
  }
});
test("normaliza una emergencia del chat para la actividad del barrio", () => {
  const parsed = parseEmergencyMessage(
    "🚨 ¡EMERGENCIA ACTIVADA! 🚨\nMotivo: Fuga de gas\nVecino: María López\nDirección: Calle Principal 12\n[LOCATION:0.351,-78.122]",
    "Dirección alternativa",
  );

  assert.deepEqual(parsed, {
    title: "Emergencia",
    description: "Fuga de gas",
    address: "Calle Principal 12",
    latitude: 0.351,
    longitude: -78.122,
  });
  assert.equal(parseEmergencyMessage("Mensaje normal"), null);
});
