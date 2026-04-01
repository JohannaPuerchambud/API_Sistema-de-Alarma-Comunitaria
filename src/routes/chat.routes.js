import { Router } from "express";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { getNeighborhoodMessages } from "../controllers/chat.controller.js";

const router = Router();

router.get("/messages", verifyToken, getNeighborhoodMessages);

export const chatRoutes = router;
