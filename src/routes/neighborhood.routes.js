import express from "express";
import {
  getNeighborhoods,
  getNeighborhoodById,
  createNeighborhood,
  updateNeighborhood,
  deleteNeighborhood
} from "../controllers/neighborhood.controller.js";
import {
  verifyToken,
  onlyAdminGeneral,
  adminGeneralOrBarr
} from "../middlewares/auth.middleware.js";

const router = express.Router();

// 👇 Ahora Admin General ve todos los barrios y Admin de Barrio solo el suyo
router.get("/", verifyToken, adminGeneralOrBarr, getNeighborhoods);

// El resto de operaciones siguen siendo solo para Admin General
router.get("/:id",    verifyToken, onlyAdminGeneral, getNeighborhoodById);
router.post("/",      verifyToken, onlyAdminGeneral, createNeighborhood);
router.put("/:id",    verifyToken, onlyAdminGeneral, updateNeighborhood);
router.delete("/:id", verifyToken, onlyAdminGeneral, deleteNeighborhood);

export { router as neighborhoodRoutes };
