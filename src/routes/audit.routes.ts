import { Router } from "express";
import {
  handleGetAuditLogs,
  handleVerifyAuditChain,
} from "../controllers/audit.controller";
import { authenticate } from "../middleware/authenticate";
import { rateLimiterMiddleware } from "../middleware/rateLimiter";

const router = Router();

router.use(authenticate);
router.use(rateLimiterMiddleware);

router.get("/", handleGetAuditLogs);
router.get("/verify", handleVerifyAuditChain);

export default router;
