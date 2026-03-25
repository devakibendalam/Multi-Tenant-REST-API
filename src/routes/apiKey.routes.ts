import { Router } from "express";
import {
  handleRotateApiKey,
  handleListApiKeys,
} from "../controllers/apiKey.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { rateLimiterMiddleware } from "../middleware/rateLimiter";

const router = Router();

router.use(authenticate);
router.use(rateLimiterMiddleware);

router.get("/", handleListApiKeys);
router.post("/rotate", authorize("OWNER"), handleRotateApiKey);

export default router;
