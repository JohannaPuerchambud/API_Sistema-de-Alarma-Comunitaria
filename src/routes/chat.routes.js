import { Router } from "express";
import {
  neighborhoodMember,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import {
  getNeighborhoodMessages,
  sendNeighborhoodMessage,
  uploadChatImage,
} from "../controllers/chat.controller.js";

const router = Router();

router.get("/messages", verifyToken, neighborhoodMember, getNeighborhoodMessages);
router.post(
  "/messages",
  verifyToken,
  neighborhoodMember,
  sendNeighborhoodMessage,
);

router.post(
  "/upload-image",
  verifyToken,
  neighborhoodMember,
  uploadImage,
  uploadChatImage,
);

export const chatRoutes = router;
