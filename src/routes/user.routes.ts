import { Router } from "express";
import {
  handleGetUsers,
  handleGetUserById,
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
} from "../controllers/user.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { rateLimiterMiddleware } from "../middleware/rateLimiter";

const router = Router();

router.use(authenticate);
router.use(rateLimiterMiddleware);

router.get("/", handleGetUsers);
router.get("/:userId", handleGetUserById);

// Only Owners can create, update, delete users
router.post("/", authorize("OWNER"), handleCreateUser);
router.patch("/:userId", authorize("OWNER"), handleUpdateUser);
router.delete("/:userId", authorize("OWNER"), handleDeleteUser);

export default router;
