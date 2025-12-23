import { Router } from "express";
import { searchGeocode } from "../controllers/geocode.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

export const geocodeRoutes = Router();

geocodeRoutes.get("/", verifyToken, searchGeocode);
