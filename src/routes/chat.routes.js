import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { uploadImage } from "../middlewares/upload.middleware.js";
import { getNeighborhoodMessages, uploadChatImage } from "../controllers/chat.controller.js";

const router = Router();

router.get("/messages", verifyToken, getNeighborhoodMessages);

// ✅ Endpoint para subir imágenes del chat al backend (Firebase Storage via Admin SDK)
router.post("/upload-image", verifyToken, uploadImage, uploadChatImage);

export const chatRoutes = router;
