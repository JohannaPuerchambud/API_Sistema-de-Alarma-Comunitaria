import express from "express";
import {
  getNeighborhoods, getNeighborhoodById, createNeighborhood, updateNeighborhood, deleteNeighborhood
} from "../controllers/neighborhood.controller.js";
import { verifyToken, onlyAdminGeneral } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/",      verifyToken, onlyAdminGeneral, getNeighborhoods);
router.get("/:id",   verifyToken, onlyAdminGeneral, getNeighborhoodById);
router.post("/",     verifyToken, onlyAdminGeneral, createNeighborhood);
router.put("/:id",   verifyToken, onlyAdminGeneral, updateNeighborhood);
router.delete("/:id",verifyToken, onlyAdminGeneral, deleteNeighborhood);

export { router as neighborhoodRoutes };
