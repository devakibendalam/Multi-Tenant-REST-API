import express from "express";
import cors from "cors";
import helmet from "helmet";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { responseTimeMiddleware } from "./middleware/responseTime";

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Track response times for /health endpoint
app.use(responseTimeMiddleware);

// Routes
app.use("/api", routes);

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    message: "Velozity Multi-Tenant API",
    version: "1.0.0",
    documentation: "/api/health for system status",
  });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;
