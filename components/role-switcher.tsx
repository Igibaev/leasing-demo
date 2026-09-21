"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { completeAction } from "@/lib/client-navigation";
import { switchRoleAction } from "@/app/actions";

export function RoleSwitcher({ users, currentUserId }: { users: { id: string; name: string; roleCode: string; roleName: string }[]; currentUserId: string; currentRole: string }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <select
        name="userId"
        aria-label="Демо-пользователь"
        disabled={pending || !ready}
        required
        onChange={async (event) => {
          const data = new FormData();
          data.set("userId", event.currentTarget.value);
          data.set("returnTo", pathname);
          setPending(true);
          setError(null);
          try {
            const result = await switchRoleAction(data);
            if (result.redirectTo) completeAction(undefined, result.redirectTo);
            else setError(result.error ?? "Не удалось сменить роль");
          } catch { setError("Не удалось сменить роль. Повторите попытку."); }
          finally { setPending(false); }
        }}
        defaultValue={currentUserId || ""}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {!currentUserId ? <option value="">— выберите роль —</option> : null}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} — {user.roleName}
          </option>
        ))}
      </select>
      {pending ? <span className="text-xs text-slate-400">меняю...</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}