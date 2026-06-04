import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { getCurrentUser } from "../services/current-user.service.js";
dotenv.config();

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader)
    return res.status(403).json({ message: "Token no proporcionado" });

  try {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await getCurrentUser(decoded.id);
    if (!currentUser) {
      return res.status(401).json({ message: "La sesion ya no es valida" });
    }

    req.user = currentUser;
    next();
  } catch (error) {
    if (error?.code) {
      console.error("Error consultando el usuario autenticado:", error);
      return res.status(500).json({ message: "No se pudo validar la sesion" });
    }
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export const requireRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "No autenticado" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    next();
  };

export const onlyAdminGeneral = requireRoles(1);
export const adminGeneralOrBarr = requireRoles(1, 2);
export const onlyUser = requireRoles(3);
