// src/routes/geocode.routes.js
import { Router } from "express";
import { searchGeocode } from "../controllers/geocode.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

export const geocodeRoutes = Router();

// 🔒 protegida (solo usuarios autenticados)
geocodeRoutes.get("/", verifyToken, searchGeocode);
