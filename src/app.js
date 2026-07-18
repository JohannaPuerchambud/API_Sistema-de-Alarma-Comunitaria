import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { authRoutes } from "./routes/auth.routes.js";
import { userRoutes } from "./routes/user.routes.js";
import { neighborhoodRoutes } from "./routes/neighborhood.routes.js";
import { geocodeRoutes } from "./routes/geocode.routes.js";
import { reportRoutes } from "./routes/report.routes.js";
import { chatRoutes } from "./routes/chat.routes.js";
import { upcRoutes } from "./routes/upc.routes.js"; 
import { mediaRoutes } from "./routes/media.routes.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const defaultAllowedOrigins = [
  "https://app-sistema-de-alarma-comunitaria.onrender.com",
  "http://localhost:4200",
];

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origen no permitido por CORS"));
    },
  }),
);
app.use(express.json({ limit: "100kb" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/neighborhoods", neighborhoodRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upcs", upcRoutes);
app.use("/api/media", mediaRoutes);

app.get("/test", (req, res) => {
  res.json({ message: "API funcionando correctamente 🚀" });
});

// ✅ Middleware global de errores: siempre devuelve JSON, nunca HTML
app.use((err, req, res, next) => {
  console.error("Error no controlado:", err);

  // Errores de Multer (archivo muy grande, tipo inválido, etc.)
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "La imagen es demasiado grande. Máximo 5 MB." });
  }
  if (err.message && err.message.includes("Solo se permiten imágenes")) {
    return res.status(400).json({ message: err.message });
  }

  const status = err.status || 500;
  res.status(status).json({
    message: status >= 500 ? "Error interno del servidor." : err.message,
  });
});

export default app;
