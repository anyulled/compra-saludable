import type { User } from "@supabase/supabase-js";

function authorizedEmails() {
  const allowlist = (process.env.AUTHORIZED_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.length === 2 && new Set(allowlist).size === 2 ? allowlist : [];
}

export function hasAuthorizedEmails() {
  return authorizedEmails().length === 2;
}

export function isAuthConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      hasAuthorizedEmails(),
  );
}

export function isAuthorizedEmail(email: string | undefined | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  return Boolean(normalizedEmail && authorizedEmails().includes(normalizedEmail));
}

export function isAuthorizedGoogleUser(user: User | null | undefined) {
  return Boolean(
    user &&
      isAuthorizedEmail(user.email) &&
      user.email_confirmed_at &&
      user.app_metadata.provider === "google" &&
      Array.isArray(user.app_metadata.providers) &&
      user.app_metadata.providers.length === 1 &&
      user.app_metadata.providers[0] === "google" &&
      user.identities?.some((identity) => identity.provider === "google"),
  );
}
