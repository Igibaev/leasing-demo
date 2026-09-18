import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getRole, menuFor } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { RoleSwitcher } from "./role-switcher";
import { formatDate } from "@/lib/datetime";
import { Bell } from "lucide-react";

export async function Shell({ children, currentPath }: { children: React.ReactNode; currentPath?: string }) {
  const session = await getSessionUser();
  let roleName = "Гость";
  let menu: ReturnType<typeof menuFor> = [];
  let notifications: { id: string; subject: string; body: string; createdAt: Date }[] = [];
  let users: { id: string; name: string; roleCode: string; roleName: string }[] = [];
  let systemDate = new Date();
  const [notifs, allUsers, config] = await Promise.all([
    session ? prisma.notification.findMany({ where: { userId: session.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 5 }) : Promise.resolve([]),
    prisma.user.findMany({ select: { id: true, name: true, roleCode: true, role: { select: { name: true } } }, orderBy: { roleCode: "asc" } }),
    prisma.config.findUnique({ where: { id: "system" } }),
  ]);
  notifications = notifs;
  users = allUsers.map((u) => ({ id: u.id, name: u.name, roleCode: u.roleCode, roleName: u.role.name }));
  if (config?.systemDate) systemDate = new Date(config.systemDate);
  if (session) {
    const role = getRole(session.roleCode);
    roleName = role.name;
    menu = menuFor(session.roleCode);
  }

  const simulated = Math.abs(new Date().getTime() - systemDate.getTime()) > 3600000;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">АЛ</div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-slate-900">АИС Лизинг</div>
              <div className="text-[10px] text-slate-400">прототип · демо-данные</div>
            </div>
          </Link>

          <form action="/search" className="flex min-w-0 flex-1 items-center gap-2">
            <input
              name="q"
              placeholder="Поиск: БИН, ИИН, ФИО, заявка, договор, VIN..."
              className="h-8 w-full max-w-md rounded-md border border-slate-300 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="h-8 rounded-md bg-slate-100 px-3 text-xs text-slate-700 hover:bg-slate-200">
              Найти
            </button>
          </form>

          <div className="ml-auto flex items-center gap-2">
            {simulated && systemDate ? (
              <span className="hidden rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 sm:block">
                Системная дата: {formatDate(systemDate)}
              </span>
            ) : null}
            <details className="relative">
              <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                <Bell className="h-4 w-4" />
                {notifications.length > 0 ? (
                  <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {notifications.length}
                  </span>
                ) : null}
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div className="px-2 py-1 text-xs font-semibold text-slate-500">Уведомления</div>
                {notifications.length === 0 ? <div className="px-2 py-3 text-xs text-slate-400">Нет новых уведомлений</div> : null}
                {notifications.map((notif) => (
                  <div key={notif.id} className="rounded-md px-2 py-2 hover:bg-slate-50">
                    <div className="text-xs font-semibold text-slate-800">{notif.subject}</div>
                    <div className="text-[11px] text-slate-500">{notif.body}</div>
                  </div>
                ))}
              </div>
            </details>
            {users.length ? <RoleSwitcher users={users} currentUserId={session?.id ?? ""} currentRole={session?.roleCode ?? ""} /> : null}
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto bg-slate-100 px-4 text-xs">
          {session ? <span className="mr-2 py-2 font-medium text-slate-500">Роль: {roleName}</span> : <span className="py-2 text-slate-400">Войдите под ролью</span>}
          {menu.map((item) => {
            const href = item.module === "dashboard" ? "/" : `/${item.module}`;
            return (
              <Link
                key={item.module}
                href={href}
                className={`shrink-0 rounded-t-md px-3 py-2 font-medium transition-colors ${
                  currentPath === href || (currentPath?.startsWith(`${href}/`) && href !== "/") ? "border-b-2 border-blue-600 bg-white text-blue-700" : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-[10px] text-slate-400">
        Прототип АИС «Лизинг» · моковые данные и ЭЦП · расчёты через decimal.js · аудит без возможности удаления
      </footer>
    </div>
  );
}