// app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// 🔹 Importa todas las rutas
import { authRoutes } from "./routes/auth.routes.js";
import { userRoutes } from "./routes/user.routes.js"; // 👈 AGREGA ESTA
import { neighborhoodRoutes } from "./routes/neighborhood.routes.js"; // 👈 YA EXISTE

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Monta las rutas principales
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes); // 👈 ESTA LÍNEA ES LA QUE FALTA
app.use("/api/neighborhoods", neighborhoodRoutes);

// 🔹 Ruta de prueba opcional
app.get("/test", (req, res) => {
  res.json({ message: "API funcionando correctamente 🚀" });
});

export default app;
