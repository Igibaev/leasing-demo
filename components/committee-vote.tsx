"use client";

import { useState } from "react";
import { voteAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

export function CommitteeVote({ applicationId, myVote }: { applicationId: string; myVote: string | null }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (vote: "FOR" | "AGAINST" | "ABSTAIN") => {
    setBusy(true);
    setError(null);
    const result = await voteAction(applicationId, vote, comment);
    if (result && "error" in result && result.error) setError(result.error);
    setBusy(false);
  };
  const voteLabel = (myVote === "FOR" ? "за" : myVote === "AGAINST" ? "против" : myVote === "ABSTAIN" ? "воздержался" : "") as string;
  return (
    <div className="space-y-2">
      <Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Комментарий (виден в протоколе)" className="h-8 text-xs" />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</div> : null}
      <div className="flex gap-1">
        <Button size="sm" variant="success" disabled={busy || myVote !== null} onClick={() => run("FOR")}>{myVote === "FOR" ? "✓" : "За"}</Button>
        <Button size="sm" variant="secondary" disabled={busy || myVote !== null} onClick={() => run("ABSTAIN")}>{myVote === "ABSTAIN" ? "✓" : "Воздержаться"}</Button>
        <Button size="sm" variant="destructive" disabled={busy || myVote !== null} onClick={() => run("AGAINST")}>{myVote === "AGAINST" ? "✗" : "Против"}</Button>
      </div>
      {myVote ? <div className="text-[11px] text-slate-400">Ваш голос уже учтён ({voteLabel}). Повторное голосование заблокировано.</div> : null}
    </div>
  );
}