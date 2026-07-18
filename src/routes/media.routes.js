import { Router } from "express";

import { streamProtectedImage } from "../controllers/media.controller.js";

export const mediaRoutes = Router();

mediaRoutes.get("/images/:token", streamProtectedImage);
