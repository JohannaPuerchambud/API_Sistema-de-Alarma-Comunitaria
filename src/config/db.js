import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;
const sslEnabled = String(process.env.DB_SSL ?? "true").toLowerCase() !== "false";
const rejectUnauthorized =
  String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !== "false";

const ssl = sslEnabled
  ? {
      rejectUnauthorized,
      ...(process.env.DB_SSL_CA
        ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") }
        : {}),
    }
  : false;

export const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl,
});