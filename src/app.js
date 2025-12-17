// app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// 🔹 Importa todas las rutas
import { authRoutes } from "./routes/auth.routes.js";
import { userRoutes } from "./routes/user.routes.js";
import { neighborhoodRoutes } from "./routes/neighborhood.routes.js";
import { geocodeRoutes } from "./routes/geocode.routes.js"; // ✅ NUEVA

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Monta las rutas principales
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/neighborhoods", neighborhoodRoutes);
app.use("/api/geocode", geocodeRoutes); // ✅ NUEVA RUTA

// 🔹 Ruta de prueba
app.get("/test", (req, res) => {
  res.json({ message: "API funcionando correctamente 🚀" });
});

export default app;
