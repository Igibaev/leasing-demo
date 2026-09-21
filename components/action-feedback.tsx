"use client";

import { useEffect, useState } from "react";

export function ActionFeedback() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    try {
      const message = sessionStorage.getItem("leasing-feedback");
      sessionStorage.removeItem("leasing-feedback");
      if (message) setMessage(message);
    } catch { /* page remains usable without browser storage */ }
  }, []);
  if (!message) return null;
  return <div role="status" className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
    <p className="whitespace-pre-line">{message}</p>
    <button type="button" onClick={() => setMessage(null)} aria-label="Закрыть уведомление">×</button>
  </div>;
}
