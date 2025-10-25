import { pool } from "./config/db.js";

(async () => {
  const res = await pool.query("SELECT NOW() as fecha");
  console.log("Conexión exitosa a PostgreSQL:", res.rows[0].fecha);
  process.exit();
})();
