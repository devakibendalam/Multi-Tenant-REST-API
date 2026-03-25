import { getEmailTransporter } from "../config/email";
import nodemailer from "nodemailer";

export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<{ messageId: string; previewUrl: string | false }> {
  const transporter = await getEmailTransporter();

  const info = await transporter.sendMail({
    from: '"Velozity Platform" <noreply@velozity.com>',
    to,
    subject,
    text,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  console.log(`📧 Email sent: ${info.messageId}`);
  if (previewUrl) {
    console.log(`📧 Preview URL: ${previewUrl}`);
  }

  return {
    messageId: info.messageId,
    previewUrl: previewUrl,
  };
}
