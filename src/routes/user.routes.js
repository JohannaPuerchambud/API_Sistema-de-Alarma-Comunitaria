import express from "express";
import { saveFcmToken } from "../controllers/user.controller.js";
import {
  getUsers, getUserById, createUser, updateUser, deleteUser
} from "../controllers/user.controller.js";
import { verifyToken, adminGeneralOrBarr } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/fcm-token", verifyToken, saveFcmToken);

router.get("/", verifyToken, adminGeneralOrBarr, getUsers);
router.get("/:id", verifyToken, adminGeneralOrBarr, getUserById);
router.post("/", verifyToken, adminGeneralOrBarr, createUser);
router.put("/:id", verifyToken, adminGeneralOrBarr, updateUser);
router.delete("/:id", verifyToken, adminGeneralOrBarr, deleteUser);

export { router as userRoutes };
