// routes/report.routes.js
import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import {
  createReport,
  getAllReports,
  getNeighborhoodReports,
  getMyReports,
  triggerEmergency,
} from "../controllers/report.controller.js";

export const reportRoutes = Router();

reportRoutes.get("/", verifyToken, getAllReports);

// ✅ Ahora acepta multipart/form-data con imagen opcional
reportRoutes.post("/", verifyToken, uploadImage, createReport);

// ✅ Endpoint de emergencia real (activa sirena) - ahora acepta imagen opcional
reportRoutes.post("/emergency", verifyToken, uploadImage, triggerEmergency);

reportRoutes.get("/neighborhood", verifyToken, getNeighborhoodReports);

reportRoutes.get("/mine", verifyToken, getMyReports);
