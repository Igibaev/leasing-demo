"use client";

import { useActionState } from "react";
import { switchRoleAction } from "@/app/actions";

const switchRoleWithState = (_prev: { error?: string } | null, formData: FormData) => switchRoleAction(formData);

export function RoleSwitcher({ users, currentUserId, currentRole }: { users: { id: string; name: string; roleCode: string; roleName: string }[]; currentUserId: string; currentRole: string }) {
  const [state, formAction, pending] = useActionState(switchRoleWithState, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        name="userId"
        onChange={(event) => {
          const selected = users.find((u) => u.id === event.currentTarget.value);
          const hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.name = "roleCode";
          hidden.value = selected?.roleCode ?? "";
          event.currentTarget.form?.appendChild(hidden);
          event.currentTarget.form?.requestSubmit();
        }}
        defaultValue={currentUserId}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} — {user.roleName}
          </option>
        ))}
      </select>
      <input type="hidden" name="roleCode" value={currentRole} />
      {pending ? <span className="text-xs text-slate-400">меняю...</span> : null}
      {state && "error" in state && state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}