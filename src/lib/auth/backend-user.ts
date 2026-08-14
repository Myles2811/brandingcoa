import type { PlatformUser } from "@/types/platform";

type AuthMeEnvelope = {
  success?: boolean;
  data?: Record<string, unknown> | null;
  message?: string;
};

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readNullableString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (value === null) {
      return null;
    }

    if (typeof value === "string") {
      return value.trim() || null;
    }
  }

  return null;
}

function createInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "RI"
  );
}

export function mapBackendUser(payload: unknown): PlatformUser | null {
  const envelope = payload as AuthMeEnvelope | null;
  const data = envelope?.data;

  if (!data || typeof data !== "object") {
    return null;
  }

  const nestedUser =
    "user" in data && data.user && typeof data.user === "object"
      ? (data.user as Record<string, unknown>)
      : null;
  const userSource = nestedUser ?? data;

  const name = readString(userSource, [
    "name",
    "displayName",
    "display_name",
    "full_name",
    "firstName",
  ]);
  const email = readString(userSource, [
    "email",
    "userPrincipalName",
    "preferred_username",
  ]);

  if (!name || !email) {
    return null;
  }

  return {
    id: readString(userSource, ["id"]) ?? undefined,
    entraObjectId: readString(userSource, ["entraObjectId", "entra_object_id", "oid"]) ?? undefined,
    name,
    email,
    role: readString(userSource, ["role", "jobTitle", "job_title", "title"]) ?? "Authenticated User",
    initials: readString(userSource, ["initials"]) ?? createInitials(name),
    team: readString(userSource, ["team", "department", "business_unit"]) ?? "Rebate Intelligence",
    firstName: readString(userSource, ["firstName", "first_name"]) ?? undefined,
    lastName: readString(userSource, ["lastName", "last_name"]) ?? undefined,
    jobTitle: readNullableString(userSource, ["jobTitle", "job_title"]),
    department: readNullableString(userSource, ["department"]),
  };
}

export async function fetchBackendUser(accessToken: string) {
  const response = await fetch("/api/auth/me", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return mapBackendUser(await response.json());
}
