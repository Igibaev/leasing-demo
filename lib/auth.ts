import { cookies } from "next/headers";
import type { RoleInfo } from "./roles";
import { getRole } from "./roles";

export const SESSION_COOKIE = "leasing_session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roleCode: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const [userId, roleCode] = value.split(":");
  if (!userId || !roleCode) return null;
  return { id: userId, name: "", email: "", roleCode };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Не авторизован. Выберите пользователя в шапке.");
  const full = await import("./prisma").then(({ prisma }) => prisma.user.findUnique({ where: { id: user.id } }));
  if (full) {
    user.name = full.name;
    user.email = full.email;
  }
  return user;
}

export async function requireRole(): Promise<RoleInfo> {
  const user = await requireUser();
  return getRole(user.roleCode);
}