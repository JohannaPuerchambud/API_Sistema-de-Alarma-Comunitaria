// routes/report.routes.js
import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  createReport,
  getAllReports,
  getNeighborhoodReports,
  getMyReports,
  triggerEmergency,
} from "../controllers/report.controller.js";

export const reportRoutes = Router();

reportRoutes.get("/", verifyToken, getAllReports);

reportRoutes.post("/", verifyToken, createReport);

// ✅ Nuevo endpoint de emergencia real (activa sirena)
reportRoutes.post("/emergency", verifyToken, triggerEmergency);

reportRoutes.get("/neighborhood", verifyToken, getNeighborhoodReports);

reportRoutes.get("/mine", verifyToken, getMyReports);
