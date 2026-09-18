import { PrismaClient } from "@prisma/client";
import { calculateSchedule, type ScheduleLine } from "../lib/calc";
import { dateParam, addMonths, addDays } from "../lib/datetime";
import { calculateScoring, DEFAULT_SCORING_MODEL } from "../lib/rules";
import { factsFor } from "../lib/scoring";
import { ALL_ROLES } from "../lib/roles";

const prisma = new PrismaClient();

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260918);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number): number => min + rand() * (max - min);
const intBetween = (min: number, max: number): number => Math.floor(between(min, max + 1));

let binCounter = 10000000000;
function kzBin(): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    binCounter += 1;
    const counter = String(binCounter).padStart(11, "0");
    const digits = counter.slice(-11).split("").map((c) => Number(c));
    let sum = 0;
    digits.forEach((d, i) => {
      sum += d * (i + 1);
    });
    const control = sum % 11;
    if (control === 10) continue;
    digits.push(control);
    return digits.join("");
  }
  throw new Error("Unable to generate unique BIN");
}

const CITIES = ["г. Алматы", "г. Астана", "г. Шымкент", "г. Караганда", "г. Актау", "г. Усть-Каменогорск", "г. Атырау"];
const STREETS = ["ул. Абая", "пр. Достык", "ул. Сейфуллина", "пр. Республики", "ул. Толе би", "ул. Гоголя", "мкр. Самал-3"];

const clientSeeds: { name: string; type: string; group?: string; oked: string; sector: string }[] = [
  { name: "ТОО АгроТехСервис", type: "LEGAL", group: "GRP-001", oked: "01110", sector: "agriculture" },
  { name: "ТОО КазСтройМонтаж", type: "LEGAL", group: "GRP-001", oked: "41201", sector: "construction" },
  { name: "ТОО АвтоТрансЛизинг", type: "LEGAL", group: "GRP-001", oked: "49410", sector: "transport" },
  { name: "ТОО ШымкентАгроТрейд", type: "LEGAL", oked: "46210", sector: "agriculture" },
  { name: "ТОО Eurasia Machinery", type: "LEGAL", oked: "46610", sector: "trade" },
  { name: "ТОО Aral Distribution", type: "LEGAL", group: "GRP-002", oked: "46900", sector: "trade" },
  { name: "АО ТуркестанЛогистик", type: "LEGAL", group: "GRP-002", oked: "52212", sector: "transport" },
  { name: "ИП Байгазин С. К.", type: "IE", oked: "49231", sector: "transport" },
  { name: "ТОО СпецТехПарк", type: "LEGAL", oked: "46630", sector: "trade" },
  { name: "ТОО MedTechKaz", type: "LEGAL", oked: "86101", sector: "health" },
  { name: "ТОО ПромТрейд", type: "LEGAL", group: "GRP-002", oked: "46690", sector: "trade" },
  { name: "ТОО КазАгроПро", type: "LEGAL", oked: "01110", sector: "agriculture" },
  { name: "ТОО ОрдаМеталл", type: "LEGAL", oked: "24100", sector: "industry" },
  { name: "ИП Нурланова А. М.", type: "IE", oked: "45201", sector: "transport" },
  { name: "ТОО АлтынСапар Групп", type: "LEGAL", group: "GRP-003", oked: "68201", sector: "realty" },
  { name: "ТОО Жетысу Транс", type: "LEGAL", group: "GRP-003", oked: "49420", sector: "transport" },
  { name: "ТОО КаспийШельфТех", type: "LEGAL", oked: "09100", sector: "energy" },
  { name: "ТОО Медицинский центр Асар", type: "LEGAL", oked: "86101", sector: "health" },
  { name: "ТОО ГорСвет Инжиниринг", type: "LEGAL", oked: "43211", sector: "construction" },
  { name: "ИП Токтагулов Ж. Б.", type: "IE", oked: "47110", sector: "trade" },
  { name: "ТОО БигФарм Казахстан", type: "LEGAL", oked: "01113", sector: "agriculture" },
  { name: "ТОО СтройБетон", type: "LEGAL", group: "GRP-003", oked: "23951", sector: "industry" },
  { name: "ТОО Альфа-Лизинг Оператор", type: "LEGAL", oked: "64910", sector: "finance" },
  { name: "ТОО КарТранс Восток", type: "LEGAL", oked: "49410", sector: "transport" },
  { name: "ТОО Пекарь Шымкент", type: "LEGAL", oked: "10710", sector: "food" },
  { name: "ИП Сахиева Д. Н.", type: "IE", oked: "56101", sector: "food" },
  { name: "ТОО ЮгСпецСтрой", type: "LEGAL", oked: "42110", sector: "construction" },
  { name: "ТОО Дан-Строй", type: "LEGAL", oked: "41202", sector: "construction" },
  { name: "ТОО Qazaq Steel Group", type: "LEGAL", oked: "24100", sector: "industry" },
  { name: "ТОО АгроФинанс Сервис", type: "LEGAL", oked: "64910", sector: "finance" },
  { name: "ТОО ФармДистрибуция Онтустик", type: "LEGAL", oked: "46450", sector: "trade" },
  { name: "ТОО КарагандаЛогистик", type: "LEGAL", oked: "52213", sector: "transport" },
  { name: "ТОО МангистауТранс", type: "LEGAL", oked: "49420", sector: "transport" },
  { name: "ИП Абдуллина Г. Р.", type: "IE", oked: "47111", sector: "trade" },
  { name: "ТОО ВостокЭнергоСтрой", type: "LEGAL", oked: "42220", sector: "energy" },
  { name: "ТОО ТекстильПром Алматы", type: "LEGAL", oked: "13940", sector: "industry" },
  { name: "ТОО ГорноДобыча-Плюс", type: "LEGAL", oked: "08111", sector: "mining" },
  { name: "ТОО Алатау МедСервис", type: "LEGAL", oked: "86900", sector: "health" },
  { name: "ИП Каримов Р. А.", type: "IE", oked: "49411", sector: "transport" },
  { name: "ТОО Самрук Трейд O.N.E.", type: "LEGAL", oked: "46900", sector: "trade" },
];

const PRODUCTS = ["Автобус", "Грузовой транспорт", "Седельный тягач", "Экскаватор", "Станки", "Медицинское оборудование"] as const;
const ASSET_MODELS: Record<string, string[]> = {
  "Автобус": ["YUTONG ZK6118", "HIGER KLQ6129", "Golden Dragon"],
  "Грузовой транспорт": ["КАМАЗ 6520", "ЦСТ-модель 860", "Isuzu NQR"],
  "Седельный тягач": ["Volvo FH16 6x4", "Scania R500", "MAN TGX 18.440"],
  "Экскаватор": ["Hitachi ZX200", "KOBELCO SK210", "JCB JS220"],
  "Станки": ["DMG MORI NLX", "HAAS VF-2", "Trumpf TruLaser"],
  "Медицинское оборудование": ["Siemens SOMATOM", "GE Logiq E10", "Mindray MX7"],
};

const SUPPLIERS: { name: string; city: string; type: string }[] = [
  { name: "ТОО КамАЗ-Центр Азия", city: "г. Алматы", type: "Автодилер" },
  { name: "ТОО Volvo Group Kazakhstan", city: "г. Алматы", type: "Автодилер" },
  { name: "ТОО СпецТехИнвест", city: "г. Астана", type: "Спецтехника" },
  { name: "ТОО АгроТех Торг", city: "г. Шымкент", type: "Сельхозтехника" },
  { name: "ТОО МедТехноПро", city: "г. Алматы", type: "Медоборудование" },
  { name: "ТОО СтанкоИмпорт", city: "г. Астана", type: "Промоборудование" },
  { name: "ТОО АвтоВектор", city: "г. Караганда", type: "Автодилер" },
  { name: "ТОО Eurasia Truck Service", city: "г. Астана", type: "Автодилер" },
  { name: "ТОО СтройМашЦентр", city: "г. Алматы", type: "Спецтехника" },
  { name: "ТОО ЦентрСпецСбыт", city: "г. Шымкент", type: "Спецтехника" },
  { name: "ТОО ФармТекКазахстан", city: "г. Алматы", type: "Медоборудование" },
  { name: "ТОО Индустрия-Оборудование", city: "г. Караганда", type: "Промоборудование" },
  { name: "ТОО ТрансЛизинг-Партнер", city: "г. Астана", type: "Автодилер" },
  { name: "ТОО ЮгМашПоставка", city: "г. Шымкент", type: "Промоборудование" },
  { name: "ТОО МобилТехСервис", city: "г. Алматы", type: "Автодилер" },
];

type Ews = "GREEN" | "YELLOW" | "ORANGE" | "RED";
const ewsFor = (index: number): Ews => {
  if (index % 9 === 0) return "RED";
  if (index % 7 === 0) return "ORANGE";
  if (index % 5 === 0) return "YELLOW";
  return "GREEN";
};

function financeFor(): Record<string, number> {
  const revenue = Math.round(between(180_000_000, 2_400_000_000));
  const margin = between(0.06, 0.24);
  const ebitda = Math.round(revenue * margin);
  const debt = Math.round(between(40_000_000, 900_000_000));
  const equity = Math.round(between(60_000_000, 900_000_000));
  const cash = Math.round(ebitda * between(0.3, 1.2));
  const netIncome = Math.round(ebitda * between(0.3, 0.7));
  const assets = Math.round(equity * between(1.6, 3.4));
  return {
    revenue,
    ebitda,
    ebitdaMargin: Number((margin * 100).toFixed(1)),
    debt,
    debtEbitda: Number((debt / ebitda).toFixed(2)),
    cash,
    netDebtEbitda: Number(((debt - cash) / ebitda).toFixed(2)),
    equity,
    netIncome,
    assets,
    returnOnEquity: Number((netIncome / equity * 100).toFixed(1)),
    returnOnAssets: Number((netIncome / assets * 100).toFixed(1)),
    currentRatio: Number(between(0.8, 2.2).toFixed(2)),
    receivables: Math.round(revenue * between(0.08, 0.22)),
    payables: Math.round(revenue * between(0.1, 0.28)),
    inventory: Math.round(revenue * between(0.06, 0.2)),
  };
}

function makeRegistrationDates(): string[] {
  const out: string[] = [];
  for (let index = 0; index < clientSeeds.length; index += 1) {
    const year = intBetween(2006, 2023);
    const month = intBetween(1, 12);
    const day = intBetween(1, 28);
    out.push(dateParam(new Date(year, month - 1, day)));
  }
  return out;
}

interface ContractSeed {
  applicationId: string;
  signDate: Date;
  schedule: ScheduleLine[];
  behavior: "ONTIME" | "LATE" | "PARTIAL" | "DEFAULT" | "DEFAULT_180";
  asset: { type: string; name: string; vin: string; number: string; cost: string };
}

async function main() {
  const today = new Date();
  const systemDate = new Date();
  systemDate.setHours(12, 0, 0, 0);

  await prisma.config.upsert({
    where: { id: "system" },
    update: { systemDate: systemDate.toISOString() },
    create: { id: "system", systemDate: systemDate.toISOString() },
  });

  for (const role of ALL_ROLES) {
    await prisma.role.upsert({
      where: { roleCode: role.code },
      update: { name: role.name, permissions: JSON.stringify(role.permissions) },
      create: { roleCode: role.code, name: role.name, permissions: JSON.stringify(role.permissions) },
    });
  }

  const userSeeds: { code: string; name: string }[] = [
    { code: "ROLE-01", name: "Айдар Сатпаев" },
    { code: "ROLE-02", name: "Марат Жумабаев" },
    { code: "ROLE-03", name: "Динара Ахметова" },
    { code: "ROLE-03", name: "Ерлан Кенжебеков" },
    { code: "ROLE-04", name: "Алия Нурпеисова" },
    { code: "ROLE-05", name: "Серик Досымов" },
    { code: "ROLE-06", name: "Гульнара Кайсарова" },
    { code: "ROLE-07", name: "Нурлан Оспанов" },
    { code: "ROLE-08", name: "Зауреш Бектанова" },
    { code: "ROLE-09", name: "Арман Тлеубаев" },
    { code: "ROLE-10", name: "Сабина Мырзабекова" },
    { code: "ROLE-11", name: "Куаныш Сериков" },
    { code: "ROLE-12", name: "Асем Жакипова" },
    { code: "ROLE-13", name: "Виктор Палагин" },
    { code: "ROLE-14", name: "Дамир Султанов" },
    { code: "ROLE-15", name: "Тимур Карибаев" },
    { code: "ROLE-16", name: "Ляззат Шоканова" },
    { code: "ROLE-17", name: "Руслан Айтмуханов" },
    { code: "ROLE-18", name: "Гость (ООО Самрук Трейд)" },
  ];

  const users: { id: string; roleCode: string }[] = [];
  for (const seed of userSeeds) {
    const user = await prisma.user.upsert({
      where: { email: `${seed.code.toLowerCase()}-${seed.name.split(" ")[0]!.toLowerCase()}@leasing.kz` },
      update: {},
      create: {
        email: `${seed.code.toLowerCase()}-${seed.name.split(" ")[0]!.toLowerCase()}@leasing.kz`,
        name: seed.name,
        roleCode: seed.code,
      },
      select: { id: true, roleCode: true },
    });
    users.push({ id: user.id, roleCode: user.roleCode });
  }
  const userFor = (roleCode: string): string => users.find((u) => u.roleCode === roleCode)?.id ?? users[0]!.id;

  const suppliers: { id: string }[] = [];
  for (const supplier of SUPPLIERS) {
    const created = await prisma.supplier.create({
      data: { name: supplier.name, bin: kzBin(), city: supplier.city, type: supplier.type },
      select: { id: true },
    });
    suppliers.push(created);
  }

  const registrations = makeRegistrationDates();
  const clientIds: string[] = [];
  const clients: {
    id: string;
    name: string;
    clientType: string;
    binIin: string;
    groupId: string | null;
    oked: string;
    ewsColor: Ews;
    finance: Record<string, number>;
    riskRating: string;
    registrationDate: string;
    sector: string;
  }[] = [];
  for (let index = 0; index < clientSeeds.length; index += 1) {
    const seedc = clientSeeds[index]!;
    const finance = financeFor();
    const client = await prisma.client.create({
      data: {
        clientType: seedc.type,
        binIin: kzBin(),
        name: seedc.name,
        registrationDate: registrations[index]!,
        oked: seedc.oked,
        status: "ACTIVE",
        address: `${pick(CITIES)}, ${pick(STREETS)} ${intBetween(1, 180)}`,
        phone: `+7 7${intBetween(100, 999)} ${intBetween(100, 999)} ${intBetween(10, 99)} ${intBetween(10, 99)}`,
        email: `info@${seedc.name.toLowerCase().replace(/[^a-zа-я0-9]/g, "")}.kz`,
        groupId: seedc.group ?? null,
        ewsColor: ewsFor(index),
        ewsReason: "",
        financeJson: JSON.stringify(finance),
      },
      select: { id: true },
    });
    clientIds.push(client.id);
    const rating = client.ewsColor === "RED" ? "F" : client.ewsColor === "ORANGE" ? "E" : intBetween(0, 2) === 0 ? "C" : "B";
    await prisma.client.update({
      where: { id: client.id },
      data: { riskRating: rating },
    });
    clients.push({
      id: client.id,
      name: seedc.name,
      clientType: seedc.type,
      binIin: "",
      groupId: seedc.group ?? null,
      oked: seedc.oked,
      ewsColor: ewsFor(index),
      finance,
      riskRating: rating,
      registrationDate: registrations[index]!,
      sector: seedc.sector,
    });
  }

  const statusesForDemo: { status: string; count: number }[] = [
    { status: "DRAFT", count: 3 },
    { status: "REGISTERED", count: 2 },
    { status: "ANALYSIS", count: 4 },
    { status: "RISK", count: 3 },
    { status: "APPROVAL", count: 2 },
    { status: "COMMITTEE", count: 2 },
    { status: "APPROVED", count: 8 },
    { status: "REJECTED", count: 3 },
    { status: "CONTRACT", count: 4 },
  ];

  interface AppSeed {
    id: string;
    number: string;
    clientId: string;
    status: string;
    product: string;
    assetCost: string;
    downPayment: string;
    financedAmount: string;
    termMonths: number;
    annualRate: string;
    schedule: ScheduleLine[] | null;
    riskScore: number;
    riskRating: string;
    createdById: string;
    createdAt: Date;
  }

  const apps: AppSeed[] = [];
  let numberCounter = 100;
  for (const group of statusesForDemo) {
    for (let i = 0; i < group.count; i += 1) {
      const clientIndex = intBetween(0, clientIds.length - 1);
      const client = clients[clientIndex]!;
      const product = pick(PRODUCTS);
      const assetCost = Math.round(between(18_000_000, 480_000_000));
      const downShare = between(0.15, 0.4);
      const down = Math.round(assetCost * downShare);
      const financed = assetCost - down;
      const term = pick([12, 24, 36, 48, 60]);
      const rate = between(16, 24);
      const status = group.status;
      const scheduleInput = {
        assetCost: String(assetCost),
        downPayment: String(down),
        termMonths: term,
        annualRate: rate.toFixed(2),
        commission: String(Math.round(assetCost * 0.006)),
        commissionType: "IN_SCHEDULE" as const,
        vatRate: "12",
        firstPaymentDate: dateParam(addMonths(new Date(today.getFullYear() - 1, intBetween(0, 11), 1), 1)),
        scheduleType: "ANNUITY" as const,
      };
      const schedule = ["APPROVED", "REJECTED", "CONTRACT"].includes(status)
        ? calculateSchedule(scheduleInput)
        : null;
      const appl = await prisma.application.create({
        data: {
          number: `Z-2025-${numberCounter++}`,
          clientId: client.id,
          product,
          assetCost: String(assetCost),
          downPayment: String(down),
          financedAmount: String(financed),
          termMonths: term,
          annualRate: rate.toFixed(2),
          scheduleType: "ANNUITY",
          status,
          createdById: userFor("ROLE-01"),
          createdAt: addDays(today, -intBetween(3, 120)),
          scheduleJson: schedule ? JSON.stringify(schedule) : null,
        },
      });
      const facts = factsFor({ ...client, financeJson: JSON.stringify(client.finance) } as never, appl as never);
      let riskScore = 72;
      let riskRating = "B";
      try {
        const scoring = calculateScoring({
          financialCondition: facts.financialCondition,
          debtBurden: facts.debtBurden,
          paymentDiscipline: facts.paymentDiscipline,
          industry: facts.industry,
          assetQuality: facts.assetQuality,
          liquidity: facts.liquidity,
          downPayment: facts.downPayment,
          businessAge: facts.businessAge,
          additionalCollateral: facts.additionalCollateral,
        }, DEFAULT_SCORING_MODEL);
        riskScore = Math.round(Number(scoring.score));
        riskRating = scoring.rating;
      } catch {
        riskScore = 72;
        riskRating = "B";
      }
      await prisma.application.update({ where: { id: appl.id }, data: { riskScore, riskRating } });
      if (["REGISTERED", "DOCUMENTS", "ANALYSIS", "RISK", "APPROVAL", "COMMITTEE"].includes(status)) {
        await prisma.applicationStatusHistory.create({
          data: { applicationId: appl.id, fromStatus: "DRAFT", toStatus: "REGISTERED", userId: userFor("ROLE-01"), comment: "Заявка зарегистрирована" },
        });
      }
      apps.push({ id: appl.id, number: appl.number, clientId: client.id, status, product, assetCost: String(assetCost), downPayment: String(down), financedAmount: String(financed), termMonths: term, annualRate: rate.toFixed(2), schedule, riskScore, riskRating, createdById: userFor("ROLE-01"), createdAt: addDays(today, -intBetween(3, 120)) });
    }
  }

  const approvedApps = apps.filter((app) => ["APPROVED", "CONTRACT", "FUNDED"].includes(app.status));
  const toFund = approvedApps.slice(0, 15);
  const contractSeeds: ContractSeed[] = [];
  for (let index = 0; index < toFund.length; index += 1) {
    const app = toFund[index]!;
    if (!app.schedule) continue;
    const signDate = addMonths(app.createdAt, intBetween(1, 2));
    const behavior: ContractSeed["behavior"] = index >= toFund.length - 2 ? "DEFAULT_180" : index % 4 === 0 ? "LATE" : index % 5 === 0 ? "PARTIAL" : "ONTIME";
    const product = app.product;
    const model = pick(ASSET_MODELS[product] ?? ["Универсальная модель"]);
    contractSeeds.push({
      applicationId: app.id,
      signDate,
      schedule: app.schedule,
      behavior,
      asset: {
        type: product === "Станки" || product === "Медицинское оборудование" ? "EQUIPMENT" : "VEHICLE",
        name: `${model} (${product})`,
        vin: Array.from({ length: 17 }, () => "0123456789ABCDEFGHJKLMNPRSTUVWXYZ"[intBetween(0, 29)]).join(""),
        number: pick(["", "034 KKA 05", "123 ВЯА 02", "021 QAE 07", "654 ТМВ 03"]),
        cost: app.assetCost,
      },
    });
  }

  for (let index = 0; index < contractSeeds.length; index += 1) {
    const seed = contractSeeds[index]!;
    const contractNumber = `ДЛ-202${seed.signDate.getFullYear().toString().slice(-1)}-${(1001 + index)}`;
    const contract = await prisma.contract.create({
      data: {
        number: contractNumber,
        applicationId: seed.applicationId,
        clientId: apps.find((a) => a.id === seed.applicationId)!.clientId,
        signDate: seed.signDate,
        amount: seed.schedule.reduce((sum, line) => sum + Number(line.total), 0).toFixed(2),
        annualRate: apps.find((a) => a.id === seed.applicationId)!.annualRate,
        termMonths: apps.find((a) => a.id === seed.applicationId)!.termMonths,
        status: seed.behavior === "DEFAULT_180" ? "ACTIVE" : "ACTIVE",
        scheduleJson: JSON.stringify(seed.schedule),
      },
      select: { id: true },
    });
    await prisma.application.update({ where: { id: seed.applicationId }, data: { status: "FUNDED" } });

    const scheduleRec = await prisma.paymentSchedule.create({
      data: { contractId: contract.id, version: 1, isActive: true, reason: "Первичный график" },
      select: { id: true },
    });

    const lineIdBySeq = new Map<number, string>();
    for (const line of seed.schedule) {
      const createdLine = await prisma.scheduleLine.create({
        data: {
          scheduleId: scheduleRec.id,
          seq: line.seq,
          dueDate: line.dueDate,
          principal: line.principal,
          interest: line.interest,
          vat: line.vat,
          commission: line.commission,
          total: line.total,
          balance: line.balance,
          status: "OPEN",
          paidTotal: "0",
        },
        select: { id: true },
      });
      lineIdBySeq.set(line.seq, createdLine.id);
    }

    const asOf = today;
    const payableLines = seed.schedule.filter((line) => line.seq > 0 && new Date(line.dueDate) <= asOf);
    let paidCount: number;
    if (seed.behavior === "DEFAULT_180") paidCount = Math.min(2, payableLines.length);
    else if (seed.behavior === "DEFAULT") paidCount = Math.min(3, payableLines.length);
    else if (seed.behavior === "PARTIAL") paidCount = Math.max(0, payableLines.length - 1);
    else paidCount = payableLines.length;

    for (let lineIdx = 0; lineIdx < payableLines.length; lineIdx += 1) {
      const line = payableLines[lineIdx]!;
      if (lineIdx >= paidCount) break;
      const full = line.total;
      const paid = seed.behavior === "PARTIAL" && lineIdx === paidCount - 1 ? (Number(full) * 0.5).toFixed(2) : full;
      const paymentDate = seed.behavior === "LATE" ? addDays(new Date(line.dueDate), 12) : new Date(line.dueDate);
      const allocation = {
        scheduleLineId: lineIdBySeq.get(line.seq)!,
        principal: String(Number(paid) * (Number(line.principal) / Number(line.total))),
        interest: String(Number(paid) * (Number(line.interest) / Number(line.total))),
        vat: String(Number(paid) * (Number(line.vat) / Number(line.total))),
        commission: String(Number(paid) * (Number(line.commission) / Number(line.total))),
        penalty: "0",
      };
      await prisma.payment.create({
        data: {
          contractId: contract.id,
          date: paymentDate,
          amount: paid,
          source: "BANK",
          externalId: `CSV-${intBetween(10000, 99999)}`,
          allocations: JSON.stringify([allocation]),
        },
      });
      await prisma.scheduleLine.update({
        where: { id: lineIdBySeq.get(line.seq)! },
        data: { paidTotal: paid, status: Number(paid) >= Number(line.total) - 0.01 ? "PAID" : "OPEN" },
      });
    }

    const asset = await prisma.asset.create({
      data: {
        contractId: contract.id,
        type: seed.asset.type,
        name: seed.asset.name,
        vin: seed.asset.vin,
        number: seed.asset.number,
        cost: seed.asset.cost,
        status: "IN_USE",
      },
      select: { id: true },
    });

    const policyEnd = index % 3 === 0 ? addDays(systemDate, intBetween(5, 25)) : addMonths(systemDate, intBetween(2, 18));
    await prisma.insurance.create({
      data: {
        assetId: asset.id,
        insurer: pick(["АО СК Халык", "АО СК Nomad Life", "АО СК Sentinel", "АО Евразия СК"]),
        policyNumber: `INS-${intBetween(100000, 999999)}`,
        startDate: dateParam(addDays(seed.signDate, 2)),
        endDate: dateParam(policyEnd),
        beneficiary: "АИС Лизинг",
        premium: (Number(seed.asset.cost) * 0.012).toFixed(2),
      },
    });
  }

  const committeeApps = apps.filter((app) => app.status === "COMMITTEE").slice(0, 2);
  const committeeMembers = ["ROLE-14", "ROLE-15", "ROLE-02"].map((code) => userFor(code));
  if (committeeApps.length > 0) {
    const session = await prisma.committeeSession.create({
      data: {
        date: addDays(systemDate, 1),
        status: "PLANNED",
        sessionJson: JSON.stringify(committeeApps.map((app) => app.id)),
      },
      select: { id: true },
    });
    for (const memberId of committeeMembers) {
      for (const app of committeeApps) {
        if (rand() > 0.5) continue;
        await prisma.committeeVote.create({
          data: {
            sessionId: session.id,
            applicationId: app.id,
            userId: memberId,
            vote: pick(["FOR", "AGAINST", "ABSTAIN"]),
            comment: "",
          },
        });
      }
    }
  }

  const statusHistoryTargets = apps.filter((app) => ["ANALYSIS", "RISK", "APPROVAL", "COMMITTEE"].includes(app.status));
  for (const app of statusHistoryTargets.slice(0, 6)) {
    await prisma.applicationStatusHistory.create({
      data: { applicationId: app.id, fromStatus: "REGISTERED", toStatus: "ANALYSIS", userId: userFor("ROLE-03"), comment: "Пакет документов укомплектован" },
    });
  }

  await prisma.auditLog.createMany({
    data: [
      { userId: userFor("ROLE-17"), roleCode: "ROLE-17", object: "system", objectId: "seed", operation: "SEED", newValue: JSON.stringify({ clients: 40, applications: apps.length, contracts: contractSeeds.length }) },
      { userId: userFor("ROLE-01"), roleCode: "ROLE-01", object: "application", objectId: apps[0]?.id ?? "none", operation: "CREATE", newValue: "Заявка создана" },
      { userId: userFor("ROLE-03"), roleCode: "ROLE-03", object: "application", objectId: apps[0]?.id ?? "none", operation: "ANALYSIS", newValue: "Коэффициенты рассчитаны" },
    ],
  });

  for (const notif of [
    { roleCode: "ROLE-04", subject: "Стоп-фактор", body: "Заявка Z-2025-101 требует оверрайда руководителя рисков" },
    { roleCode: "ROLE-08", subject: "Юридическое заключение", body: "Договор ДЛ-2025-1003 ожидает проверки шаблона" },
    { roleCode: "ROLE-13", subject: "Просрочка", body: "Два договора в бакете 180+ требуют изъятия" },
  ]) {
    await prisma.notification.create({
      data: { userId: userFor(notif.roleCode), channel: "INAPP", subject: notif.subject, body: notif.body },
    });
  }

  console.log(`Seed OK: roles=${ALL_ROLES.length} users=${userSeeds.length} clients=${clientIds.length} suppliers=${SUPPLIERS.length} applications=${apps.length} contracts=${contractSeeds.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });