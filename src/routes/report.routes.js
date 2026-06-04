// routes/report.routes.js
import { Router } from "express";
import {
  adminGeneralOrBarr,
  onlyUser,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import {
  createReport,
  getAllReports,
  getNeighborhoodReports,
  getMyReports,
  triggerEmergency,
} from "../controllers/report.controller.js";

export const reportRoutes = Router();

reportRoutes.get("/", verifyToken, adminGeneralOrBarr, getAllReports);

// ✅ Ahora acepta multipart/form-data con imagen opcional
reportRoutes.post("/", verifyToken, onlyUser, uploadImage, createReport);

// ✅ Endpoint de emergencia real (activa sirena) - ahora acepta imagen opcional
reportRoutes.post("/emergency", verifyToken, onlyUser, uploadImage, triggerEmergency);

reportRoutes.get("/neighborhood", verifyToken, onlyUser, getNeighborhoodReports);

reportRoutes.get("/mine", verifyToken, onlyUser, getMyReports);
