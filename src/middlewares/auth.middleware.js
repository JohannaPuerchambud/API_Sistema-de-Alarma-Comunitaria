import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).json({ message: "Token no proporcionado" });

  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    // payload esperado: { id, name, role, neighborhood }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

/** Permite solo los roles indicados */
export const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "No autenticado" });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "No autorizado" });
  }
  next();
};

// Atajos
export const onlyAdminGeneral = requireRoles(1);
export const adminGeneralOrBarr = requireRoles(1, 2);
