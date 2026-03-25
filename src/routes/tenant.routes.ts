import { Router } from "express";
import {
  handleCreateTenant,
  handleGetTenant,
} from "../controllers/tenant.controller";
import { authenticate } from "../middleware/authenticate";
import { rateLimiterMiddleware } from "../middleware/rateLimiter";

const router = Router();

// Public endpoint — create a new tenant (no auth required)
router.post("/", handleCreateTenant);

// Authenticated endpoints
router.get("/me", authenticate, rateLimiterMiddleware, handleGetTenant);

export default router;
