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

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/neighborhoods", neighborhoodRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upc", upcRoutes);

app.get("/test", (req, res) => {
  res.json({ message: "API funcionando correctamente 🚀" });
});

export default app;
