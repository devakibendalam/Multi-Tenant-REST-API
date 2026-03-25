import { Worker, Job } from "bullmq";
import { getRedisClient } from "../config/redis";
import { EmailJobData } from "../types";
import { renderTemplate } from "../emails/templates";
import { sendEmail } from "../emails/transporter";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let emailWorker: Worker | null = null;

export function startEmailWorker(): Worker {
  if (emailWorker) return emailWorker;

  const connection = getRedisClient();

  emailWorker = new Worker<EmailJobData>(
    "email",
    async (job: Job<EmailJobData>) => {
      const { recipient, templateName, templateData, emailLogId } = job.data;

      console.log(
        `📧 Processing email job ${job.id}: ${templateName} -> ${recipient}`
      );

      // Update attempt count
      await prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          attemptCount: { increment: 1 },
          status: "PENDING",
        },
      });

      // Render template and send
      const rendered = renderTemplate(templateName, templateData);
      const result = await sendEmail(
        recipient,
        rendered.subject,
        rendered.body
      );

      // Update log on success
      await prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          status: "SENT",
          previewUrl: result.previewUrl ? String(result.previewUrl) : null,
        },
      });

      console.log(`✅ Email sent successfully: ${job.id}`);
      return result;
    },
    {
      connection,
      concurrency: 5,
    }
  );

  emailWorker.on("completed", (job) => {
    console.log(`✅ Email job completed: ${job?.id}`);
  });

  emailWorker.on("failed", async (job, err) => {
    console.error(`❌ Email job failed: ${job?.id}`, err.message);

    if (job) {
      const maxAttempts = job.opts.attempts || 3;
      const isFinalFailure = (job.attemptsMade ?? 0) >= maxAttempts;

      await prisma.emailLog.update({
        where: { id: job.data.emailLogId },
        data: {
          status: isFinalFailure ? "DEAD_LETTER" : "FAILED",
          errorMessage: err.message,
        },
      });

      if (isFinalFailure) {
        console.error(`💀 Email job moved to dead letter: ${job.id}`);
      }
    }
  });

  emailWorker.on("error", (err) => {
    console.error("Email worker error:", err);
  });

  console.log("✅ Email worker started");
  return emailWorker;
}

export function getEmailWorker(): Worker | null {
  return emailWorker;
}
