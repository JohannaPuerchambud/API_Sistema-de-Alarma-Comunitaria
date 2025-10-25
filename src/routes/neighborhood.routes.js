//src/routes/neighborhood.routes.js

import express from "express";
import {
  getNeighborhoods,
  getNeighborhoodById,
  createNeighborhood,
  updateNeighborhood,
  deleteNeighborhood
} from "../controllers/neighborhood.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", verifyToken, getNeighborhoods);
router.get("/:id", verifyToken, getNeighborhoodById);
router.post("/", verifyToken, createNeighborhood);
router.put("/:id", verifyToken, updateNeighborhood);
router.delete("/:id", verifyToken, deleteNeighborhood);

export { router as neighborhoodRoutes };
