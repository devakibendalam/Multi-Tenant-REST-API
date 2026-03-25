import { Router } from "express";
import {
  handleHealthCheck,
  handleMetrics,
} from "../controllers/health.controller";

const router = Router();

// Protected by internal API key (checked in controller)
router.get("/health", handleHealthCheck);
router.get("/metrics", handleMetrics);

export default router;
