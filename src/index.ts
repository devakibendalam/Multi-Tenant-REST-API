import app from "./app";
import { config } from "./config";
import { getRedisClient } from "./config/redis";
import { startEmailWorker } from "./queues/emailWorker";
import { getEmailQueue } from "./queues/emailQueue";

async function bootstrap(): Promise<void> {
  try {
    // Connect to Redis
    getRedisClient();

    // Initialize email queue
    getEmailQueue();

    // Start email worker
    startEmailWorker();

    // Start the server
    app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📍 Environment: ${config.nodeEnv}`);
      console.log(
        `📍 Health check: http://localhost:${config.port}/api/health`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();
