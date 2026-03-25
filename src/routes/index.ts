import { Router } from "express";
import tenantRoutes from "./tenant.routes";
import userRoutes from "./user.routes";
import apiKeyRoutes from "./apiKey.routes";
import auditRoutes from "./audit.routes";
import healthRoutes from "./health.routes";

const router = Router();

router.use("/tenants", tenantRoutes);
router.use("/users", userRoutes);
router.use("/api-keys", apiKeyRoutes);
router.use("/audit", auditRoutes);
router.use("/", healthRoutes);

export default router;
