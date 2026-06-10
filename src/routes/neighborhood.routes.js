import express from "express";
import {
  getNeighborhoods,
  getNeighborhoodById,
  createNeighborhood,
  updateNeighborhood,
  deleteNeighborhood,
  getNeighborhoodAdmin,
  setNeighborhoodAdmin,
} from "../controllers/neighborhood.controller.js";
import {
  verifyToken,
  onlyAdminGeneral,
  adminGeneralOrBarr,
} from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", verifyToken, adminGeneralOrBarr, getNeighborhoods);

router.get("/:id", verifyToken, onlyAdminGeneral, getNeighborhoodById);
router.post("/", verifyToken, onlyAdminGeneral, createNeighborhood);
router.put("/:id", verifyToken, onlyAdminGeneral, updateNeighborhood);
router.delete("/:id", verifyToken, onlyAdminGeneral, deleteNeighborhood);

// Representante/Admin del barrio
router.get("/:id/admin", verifyToken, onlyAdminGeneral, getNeighborhoodAdmin);
router.put("/:id/admin", verifyToken, onlyAdminGeneral, setNeighborhoodAdmin);

export { router as neighborhoodRoutes };
