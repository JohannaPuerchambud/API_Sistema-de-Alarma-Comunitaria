import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET ||= "test-secret";
process.env.EMERGENCY_COOLDOWN_SECONDS = "60";

const { pool } = await import("../src/config/db.js");
const { verifyToken } = await import("../src/middlewares/auth.middleware.js");
const { createUser, updateUser, deleteUser } = await import(
  "../src/controllers/user.controller.js"
);
const { triggerEmergency } = await import(
  "../src/controllers/report.controller.js"
);
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
  pool.query = async () => ({ rows: [] });

  try {
    const first = await claimEmergencyCooldown(42, 3);
    const second = await claimEmergencyCooldown(42, 3);

    assert.equal(first, 0);
    assert.ok(second > 0);
  } finally {
    releaseEmergencyCooldown(42, 3);
    pool.query = originalQuery;
  }
});

test("la emergencia informa resultados verificables de entrega", async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    const query = String(sql);

    if (query.includes("SELECT alarm_number, name")) {
      return { rows: [{ alarm_number: null, name: "Barrio Seguro" }] };
    }
    if (query.includes("SELECT home_lat, home_lng, address")) {
      return { rows: [{ home_lat: null, home_lng: null, address: null }] };
    }
    if (query.includes("message LIKE '%EMERGENCIA ACTIVADA%'")) {
      return { rows: [] };
    }
    if (query.includes("INSERT INTO chat_messages")) {
      return {
        rows: [
          {
            message_id: 55,
            message: "EMERGENCIA ACTIVADA",
            image_url: null,
            created_at: new Date(),
          },
        ],
      };
    }
    if (query.includes("SELECT user_id, fcm_token")) {
      return { rows: [] };
    }

    throw new Error(`Consulta inesperada: ${query}`);
  };

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
    releaseEmergencyCooldown(901, 77);
    pool.query = originalQuery;
  }
});
