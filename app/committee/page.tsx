import Link from "next/link";
import { requireUser, requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { moneyKzt } from "@/lib/money";
import { evaluateRisk } from "@/lib/scoring";
import { CommitteeVote } from "@/components/committee-vote";

export const dynamic = "force-dynamic";

export default async function CommitteePage() {
  const role = await requireRole();
  const session = await requireUser();
  if (!can(role.code, "committee", "view")) return <div className="text-sm text-slate-500">Нет доступа к разделу «Решение комитета».</div>;

  const sessions = await prisma.committeeSession.findMany({
    include: { votes: { select: { applicationId: true, userId: true, vote: true } } },
    orderBy: { date: "desc" },
    where: { status: "PLANNED" },
  });

  const rows: {
    sessionId: string;
    applicationId: string;
    application: { id: string; number: string; client: { name: string }; financedAmount: string; riskRating: string };
    votes: { userId: string; vote: string }[];
    risk: { score: string; rating: string; stopHits: number; route: string };
    myVote: string | null;
    status: string;
  }[] = [];

  for (const sessionRow of sessions) {
    const appIds = JSON.parse(sessionRow.sessionJson || "[]") as string[];
    for (const applicationId of appIds) {
      const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { client: true } });
      if (!application) continue;
      const votes = sessionRow.votes.filter((vote) => vote.applicationId === applicationId);
      const [clientContracts, industryApps] = await Promise.all([
        prisma.contract.findMany({ where: { status: "ACTIVE", application: { clientId: application.clientId } }, select: { amount: true } }),
        prisma.application.findMany({ where: { status: "APPROVED", client: { oked: { startsWith: application.client.oked.slice(0, 2) } } }, select: { financedAmount: true } }),
      ]);
      const exposureClient = clientContracts.reduce((sum, contract) => sum + Number(contract.amount), 0);
      const exposureIndustry = industryApps.reduce((sum, app) => sum + Number(app.financedAmount), 0);
      const risk = await evaluateRisk(application.client, application, [
        { scope: "CLIENT", key: application.clientId, amount: exposureClient.toFixed(2), currency: "KZT" },
        { scope: "GROUP", key: (application.client.groupId ?? application.clientId).toUpperCase(), amount: "0", currency: "KZT" },
        { scope: "INDUSTRY", key: application.client.oked.slice(0, 2), amount: exposureIndustry.toFixed(2), currency: "KZT" },
      ]);
      rows.push({
        sessionId: sessionRow.id,
        status: application.status,
        applicationId,
        application: { id: application.id, number: application.number, client: { name: application.client.name }, financedAmount: application.financedAmount, riskRating: application.riskRating },
        votes,
        risk: { score: risk.scoring.score, rating: risk.scoring.rating, stopHits: risk.stopFactors.hits.length, route: risk.limits.route },
        myVote: votes.find((vote) => vote.userId === session.id)?.vote ?? null,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Решение кредитного комитета</h1>
        <p className="text-sm text-slate-500">Демо-правило: руководитель продаж, член комитета и руководство. Два голоса «за» — одобрение; два «против» или отсутствие большинства после трёх голосов — отказ.</p>
      </div>
      {sessions.length === 0 ? <Card><CardBody className="py-8 text-center text-sm text-slate-400">Сессий комитета пока нет.</CardBody></Card> : null}
      {rows.length > 0 ? (
        <Card>
          <CardHeader title="Повестки открытых демо-заседаний" subtitle="RISK-профиль пересчитан на текущую дату" />
          <Table headers={["Номер", "Клиент", "Сделка", "Рейтинг", "Маршрут", "Профиль риска", "Текущий счёт голосов", "Ваше голосование"]}>
            {rows.map((row) => (
              <tr key={`${row.sessionId}-${row.applicationId}`}>
                <Td>
                  <Link href={`/applications/${row.application.id}`} className="font-medium text-blue-700 hover:underline">{row.application.number}</Link>
                </Td>
                <Td className="max-w-[180px] truncate">{row.application.client.name}</Td>
                <Td>{moneyKzt(row.application.financedAmount)}</Td>
                <Td><Badge variant={["A", "B"].includes(row.application.riskRating) ? "green" : row.application.riskRating === "C" ? "default" : "red"}>{row.application.riskRating}</Badge></Td>
                <Td className="text-xs">{row.risk.route === "EXTENDED" ? "расширенный" : "стандартный"}</Td>
                <Td className="text-[11px] text-slate-500">скоринг {row.risk.score} · {row.risk.rating} · стоп: {row.risk.stopHits}</Td>
                <Td className="text-xs">
                  {row.votes.length === 0 ? <span className="text-slate-300">—</span> : null}
                  {row.votes.map((vote) => (vote.vote === "FOR" ? "＋" : vote.vote === "ABSTAIN" ? "·" : "−")).join(" ")}
                </Td>
                <Td>{row.status === "COMMITTEE" && can(role.code, "committee", "approve") ? <CommitteeVote applicationId={row.applicationId} myVote={row.myVote} /> : <span className="text-xs">{row.status === "APPROVED" ? "Одобрено" : row.status === "REJECTED" ? "Отказ" : "Только просмотр"}</span>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}