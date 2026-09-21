"use client";

// Complete a mutation with a fresh document so role-dependent server content
// and all financial tables reflect the committed SQLite transaction together.
export function completeAction(message?: string, destination = window.location.href) {
  if (message) {
    try { sessionStorage.setItem("leasing-feedback", message); } catch { /* storage may be disabled */ }
  }
  window.location.assign(destination);
}
