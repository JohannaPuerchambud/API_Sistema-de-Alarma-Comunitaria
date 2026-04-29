// routes/report.routes.js
import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  createReport,
  getAllReports,
  getNeighborhoodReports,
  getMyReports,
} from "../controllers/report.controller.js";

export const reportRoutes = Router();

reportRoutes.get("/", verifyToken, getAllReports);

reportRoutes.post("/", verifyToken, createReport);

reportRoutes.get("/neighborhood", verifyToken, getNeighborhoodReports);

reportRoutes.get("/mine", verifyToken, getMyReports);

