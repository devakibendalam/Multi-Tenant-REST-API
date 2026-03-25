import { Queue } from "bullmq";
import { getRedisClient } from "../config/redis";
import { EmailJobData } from "../types";
import { PrismaClient } from "@prisma/client";
import { renderTemplate } from "../emails/templates";

const prisma = new PrismaClient();
let emailQueue: Queue | null = null;

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    const connection = getRedisClient();
    emailQueue = new Queue<EmailJobData>("email", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: false,
      },
    });
  }
  return emailQueue;
}

export async function enqueueEmail(
  tenantId: string,
  recipient: string,
  templateName: string,
  templateData: Record<string, string>
): Promise<string> {
  const rendered = renderTemplate(templateName, templateData);

  // Create email log entry
  const emailLog = await prisma.emailLog.create({
    data: {
      tenantId,
      recipient,
      templateName,
      subject: rendered.subject,
      status: "PENDING",
      attemptCount: 0,
    },
  });

  const queue = getEmailQueue();

  await queue.add(
    "send-email",
    {
      tenantId,
      recipient,
      templateName,
      templateData,
      emailLogId: emailLog.id,
    },
    {
      jobId: emailLog.id,
    }
  );

  console.log(`📧 Email job enqueued: ${templateName} -> ${recipient}`);
  return emailLog.id;
}
