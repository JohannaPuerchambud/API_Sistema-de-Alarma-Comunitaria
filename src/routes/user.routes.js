import express from "express";
import {
  saveFcmToken,
  deleteFcmToken,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getAdmins,
} from "../controllers/user.controller.js";
import {
  verifyToken,
  onlyAdminGeneral,
  adminGeneralOrBarr,
  neighborhoodMember,
} from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/fcm-token", verifyToken, neighborhoodMember, saveFcmToken);
router.delete("/fcm-token", verifyToken, neighborhoodMember, deleteFcmToken);

router.get("/admins", verifyToken, onlyAdminGeneral, getAdmins);
router.get("/", verifyToken, adminGeneralOrBarr, getUsers);
router.get("/:id", verifyToken, adminGeneralOrBarr, getUserById);
router.post("/", verifyToken, adminGeneralOrBarr, createUser);
router.put("/:id", verifyToken, adminGeneralOrBarr, updateUser);
router.delete("/:id", verifyToken, adminGeneralOrBarr, deleteUser);

export { router as userRoutes };
