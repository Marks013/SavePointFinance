import crypto from "node:crypto";

const INVITATION_TOKEN_BYTES = 24;

export function hashInvitationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createInvitationToken() {
  const rawToken = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("hex");

  return {
    rawToken,
    hashedToken: hashInvitationToken(rawToken)
  };
}

export function buildInvitationPath(token: string) {
  return `/accept-invitation?token=${encodeURIComponent(token)}`;
}
