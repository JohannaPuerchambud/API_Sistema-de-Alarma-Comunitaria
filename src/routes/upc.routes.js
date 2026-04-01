import express from "express";
import {
  getUpcs,
  getUpcById,
  createUpc,
  updateUpc,
  deleteUpc,
} from "../controllers/upc.controller.js";
import {
  verifyToken,
  onlyAdminGeneral,
} from "../middlewares/auth.middleware.js";

const router = express.Router();

// Autenticados pueden ver la lista
router.get("/", verifyToken, getUpcs);
router.get("/:id", verifyToken, getUpcById);

// Solo Admin General puede modificar
router.post("/", verifyToken, onlyAdminGeneral, createUpc);
router.put("/:id", verifyToken, onlyAdminGeneral, updateUpc);
router.delete("/:id", verifyToken, onlyAdminGeneral, deleteUpc);

export { router as upcRoutes };
