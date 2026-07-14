import express from "express";
import { rateLimit } from "express-rate-limit";
import { login } from "../controllers/auth.controller.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      message: "Demasiados intentos. Intenta nuevamente en 15 minutos.",
    });
  },
});

router.post("/login", loginLimiter, login);

export { router as authRoutes };