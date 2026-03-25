import nodemailer from "nodemailer";
import { config } from "./index";

let transporter: nodemailer.Transporter | null = null;

export async function getEmailTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  // If no SMTP credentials, create an Ethereal test account
  if (!config.smtp.user || !config.smtp.pass) {
    console.log(
      "📧 No SMTP credentials found, creating Ethereal test account..."
    );
    const testAccount = await nodemailer.createTestAccount();
    config.smtp.user = testAccount.user;
    config.smtp.pass = testAccount.pass;
    config.smtp.host = "smtp.ethereal.email";
    config.smtp.port = 587;
    console.log(`📧 Ethereal account: ${testAccount.user}`);
  }

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: false,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  return transporter;
}
