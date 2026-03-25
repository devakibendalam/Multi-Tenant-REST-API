export interface EmailTemplate {
  subject: string;
  body: (data: Record<string, string>) => string;
}

export const emailTemplates: Record<string, EmailTemplate> = {
  USER_INVITED: {
    subject: "You have been invited to {{tenantName}}",
    body: (data: Record<string, string>) =>
      `Hello ${data.userName},\n\n` +
      `You have been invited to join ${data.tenantName} as a ${data.role}.\n\n` +
      `Your account has been created with the email: ${data.email}\n\n` +
      `Please contact your organization administrator for access credentials.\n\n` +
      `Best regards,\nVelozity Platform`,
  },

  API_KEY_ROTATED: {
    subject: "API Key Rotated for {{tenantName}}",
    body: (data: Record<string, string>) =>
      `Hello ${data.ownerName},\n\n` +
      `An API key has been rotated for your organization ${data.tenantName}.\n\n` +
      `The old key (prefix: ${data.oldKeyPrefix}) will remain valid for 15 minutes.\n` +
      `The new key prefix is: ${data.newKeyPrefix}\n\n` +
      `If you did not initiate this rotation, please contact support immediately.\n\n` +
      `Rotated at: ${data.rotatedAt}\n\n` +
      `Best regards,\nVelozity Platform`,
  },

  RATE_LIMIT_WARNING: {
    subject: "Rate Limit Warning for {{tenantName}}",
    body: (data: Record<string, string>) =>
      `Hello ${data.ownerName},\n\n` +
      `Your organization ${data.tenantName} has reached ${data.percentage}% of its global rate limit.\n\n` +
      `Current usage: ${data.currentCount} / ${data.limit} requests per minute.\n\n` +
      `Please consider optimizing your API usage or contact support to increase your limits.\n\n` +
      `Best regards,\nVelozity Platform`,
  },
};

export function renderTemplate(
  templateName: string,
  data: Record<string, string>
): { subject: string; body: string } {
  const template = emailTemplates[templateName];
  if (!template) {
    throw new Error(`Email template "${templateName}" not found`);
  }

  let subject = template.subject;
  for (const [key, value] of Object.entries(data)) {
    subject = subject.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return {
    subject,
    body: template.body(data),
  };
}
