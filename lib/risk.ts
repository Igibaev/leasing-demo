import { prisma } from "./prisma";
import { evaluateRisk, type RiskResult } from "./scoring";
import type { Exposure } from "./rules";
import type { Application, Client } from "@prisma/client";

export async function computeExposures(client: Client, application: Application): Promise<Exposure[]> {
  const activeContracts = await prisma.contract.findMany({ where: { status: "ACTIVE", application: { clientId: application.clientId } }, select: { amount: true } });
  const clientExposure = activeContracts.reduce((sum, contract) => sum + Number(contract.amount), 0);
  const [groupApps, industryApps] = await Promise.all([
    client.groupId
      ? prisma.application.findMany({ where: { client: { groupId: client.groupId }, status: "APPROVED" }, select: { financedAmount: true } })
      : Promise.resolve([]),
    prisma.application.findMany({ where: { client: { oked: { startsWith: client.oked.slice(0, 2) } }, status: "APPROVED" }, select: { financedAmount: true } }),
  ]);
  const groupExposure = groupApps.reduce((sum, application) => sum + Number(application.financedAmount), 0);
  const industryExposure = industryApps.reduce((sum, application) => sum + Number(application.financedAmount), 0);
  return [
    { scope: "CLIENT", key: application.clientId, amount: clientExposure.toFixed(2), currency: "KZT" },
    { scope: "GROUP", key: (client.groupId ?? application.clientId).toUpperCase(), amount: groupExposure.toFixed(2), currency: "KZT" },
    { scope: "INDUSTRY", key: client.oked.slice(0, 2), amount: industryExposure.toFixed(2), currency: "KZT" },
  ];
}

export async function evaluateRiskFor(client: Client, application: Application): Promise<RiskResult> {
  const exposures = await computeExposures(client, application);
  return evaluateRisk(client, application, exposures);
}

export function riskProfileToDto(risk: RiskResult): { riskScore: number; riskRating: string } {
  return {
    riskScore: Number(risk.scoring.score),
    riskRating: risk.scoring.rating,
  };
}