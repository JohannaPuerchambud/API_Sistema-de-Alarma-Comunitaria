// routes/report.routes.js
import { Router } from "express";
import {
  adminGeneralOrBarr,
  neighborhoodMember,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import {
  createReport,
  getAllReports,
  getNeighborhoodActivity,
  getNeighborhoodReports,
  getMyReports,
  triggerEmergency,
} from "../controllers/report.controller.js";

export const reportRoutes = Router();

reportRoutes.get("/", verifyToken, adminGeneralOrBarr, getAllReports);

// ✅ Ahora acepta multipart/form-data con imagen opcional
reportRoutes.post("/", verifyToken, neighborhoodMember, uploadImage, createReport);

// ✅ Endpoint de emergencia real (activa sirena) - ahora acepta imagen opcional
reportRoutes.post("/emergency", verifyToken, neighborhoodMember, uploadImage, triggerEmergency);

reportRoutes.get("/neighborhood", verifyToken, neighborhoodMember, getNeighborhoodReports);

reportRoutes.get("/activity", verifyToken, neighborhoodMember, getNeighborhoodActivity);

reportRoutes.get("/mine", verifyToken, neighborhoodMember, getMyReports);
