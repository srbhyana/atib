import { Resend } from "resend";
import { db } from "@/lib/db/client";
import { emailsSent } from "@/lib/db/schema";

let client: Resend | null = null;

function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    client = new Resend(apiKey);
  }
  return client;
}

export async function sendInviteEmail(params: {
  workspaceId: string;
  toEmail: string;
  inviteUrl: string;
  roleLabel: string;
  inviterName?: string;
  workspaceName?: string;
}) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const resend = getResendClient();
  const subject = `You're invited to ${params.workspaceName || "Atib"}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>You've been invited to join <strong>${params.workspaceName || "Atib"}</strong> as a ${params.roleLabel}.</p>
      <p>${params.inviterName ? `${params.inviterName} sent you this invite.` : "Use the link below to get started."}</p>
      <p style="margin: 24px 0;">
        <a href="${params.inviteUrl}" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;">
          Accept invite
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280;">This link expires in 14 days.</p>
    </div>
  `;

  const response = await resend.emails.send({
    from,
    to: params.toEmail,
    subject,
    html,
  });

  await db.insert(emailsSent).values({
    workspaceId: params.workspaceId,
    toEmail: params.toEmail,
    template: "invite_magic_link",
    subject,
    resendId: response.data?.id || "",
    status: response.error ? "failed" : "sent",
  });

  return response;
}
