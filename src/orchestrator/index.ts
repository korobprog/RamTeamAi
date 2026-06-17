import type { AgentConfig, ChatMessage, PlanArtifact, TopologyConfig } from "../types";

const roleLines: Record<string, string> = {
  architect: "\u0410\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440 \u0441\u0432\u044f\u0437\u044b\u0432\u0430\u0435\u0442 \u0441\u043b\u043e\u0438: provider adapters \u2192 orchestrator \u2192 MCP tools \u2192 project builder.",
  coder: "\u0420\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a \u043f\u0438\u0448\u0435\u0442 \u043f\u0440\u043e\u0441\u0442\u043e\u0439 \u043a\u043e\u0434, \u0432\u044b\u0431\u0438\u0440\u0430\u0435\u0442 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u044b \u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c\u044b\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u044f.",
  critic: "\u041a\u0440\u0438\u0442\u0438\u043a \u0438\u0449\u0435\u0442 \u0440\u0438\u0441\u043a\u0438, \u043f\u0440\u043e\u0442\u0438\u0432\u043e\u0440\u0435\u0447\u0438\u044f, \u0441\u043b\u0430\u0431\u044b\u0435 \u043c\u0435\u0441\u0442\u0430 \u0438 \u0434\u043e\u0440\u043e\u0433\u0438\u0435 \u043e\u0448\u0438\u0431\u043a\u0438.",
  researcher: "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0438\u0449\u0435\u0442 MCP/Web \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438, \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u0442 \u0441\u0432\u0435\u0434\u0435\u043d\u0438\u044f \u0438 \u043e\u0442\u0434\u0430\u0435\u0442 \u0444\u0430\u043a\u0442\u044b \u0432 Build.",
  security: "\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u0442 \u0441\u0435\u043a\u0440\u0435\u0442\u044b, \u043f\u0440\u0430\u0432\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u0430, sandbox \u0438 \u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u043a\u043b\u044e\u0447\u0435\u0439.",
  product: "\u041f\u0440\u043e\u0434\u0443\u043a\u0442 \u0444\u043e\u043a\u0443\u0441\u0438\u0440\u0443\u0435\u0442\u0441\u044f \u043d\u0430 UX, \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u0438 \u0444\u0443\u043d\u043a\u0446\u0438\u0438 \u0438 \u043f\u043e\u043d\u044f\u0442\u043d\u043e\u043c \u0440\u0430\u0431\u043e\u0447\u0435\u043c \u043f\u043e\u0442\u043e\u043a\u0435.",
  tester: "\u0422\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0449\u0438\u043a \u043f\u043b\u0430\u043d\u0438\u0440\u0443\u0435\u0442 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438, \u0440\u0435\u0433\u0440\u0435\u0441\u0441\u0438\u044e, smoke test \u0438 \u043a\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u0433\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u0438.",
  arbiter: "\u0410\u0440\u0431\u0438\u0442\u0440 \u0441\u0432\u043e\u0434\u0438\u0442 \u043c\u043d\u0435\u043d\u0438\u044f, \u0432\u044b\u0431\u0438\u0440\u0430\u0435\u0442 \u0438\u0442\u043e\u0433\u043e\u0432\u044b\u0439 \u043f\u043b\u0430\u043d \u0438 \u043e\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u0442 \u0437\u0430\u0446\u0438\u043a\u043b\u0438\u0432\u0430\u043d\u0438\u0435.",
};

export async function runPlanningRound(agents: AgentConfig[], topology: TopologyConfig, currentTokens: number, userPrompt = ""): Promise<ChatMessage[]> {
  const activeAgents = topology.kind === "pipeline" ? agents : agents.slice(0, Math.min(agents.length, 3));
  const focus = userPrompt.trim() || "\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435 RamTeamAi MVP";
  const topologyNote = topology.kind === "debate"
    ? `\u0424\u043e\u0440\u043c\u0430\u0442 debate: \u0441\u0432\u0435\u0440\u044f\u044e \u0430\u0440\u0433\u0443\u043c\u0435\u043d\u0442\u044b \u0441 \u0434\u0440\u0443\u0433\u0438\u043c\u0438 \u0430\u0433\u0435\u043d\u0442\u0430\u043c\u0438, \u043c\u0430\u043a\u0441\u0438\u043c\u0443\u043c ${topology.maxRounds} \u0440\u0430\u0443\u043d\u0434\u043e\u0432.`
    : topology.kind === "pipeline"
      ? "\u0424\u043e\u0440\u043c\u0430\u0442 pipeline: \u043f\u0435\u0440\u0435\u0434\u0430\u044e \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u043c\u0443 \u0430\u0433\u0435\u043d\u0442\u0443 \u0431\u0435\u0437 \u043f\u043e\u0442\u0435\u0440\u0438 \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442\u0430."
      : "\u0424\u043e\u0440\u043c\u0430\u0442 supervisor: \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u044e \u043f\u043e\u0434\u0437\u0430\u0434\u0430\u0447\u0443 \u043e\u0442 \u0432\u0435\u0434\u0443\u0449\u0435\u0433\u043e \u0430\u0433\u0435\u043d\u0442\u0430.";
  await new Promise((resolve) => window.setTimeout(resolve, 420));

  return activeAgents.map((agent, index) => ({
    id: "round-" + Date.now() + "-" + agent.id,
    author: agent.id,
    agentRole: agent.role,
    text: `${topology.kind === "supervisor" && index > 0 ? agent.name + ": " : ""}${roleLines[agent.role]} \u0424\u043e\u043a\u0443\u0441 \u0437\u0430\u0434\u0430\u0447\u0438: ${focus}. ${topologyNote}`,
    createdAt: new Date().toISOString(),
    tokens: 740 + Math.round(currentTokens / 10_000) * 20 + index * 80,
    tool: agent.tools.includes("mcp") ? "mcp" : undefined,
  }));
}

export function synthesizePlan(messages: ChatMessage[], artifact: PlanArtifact): PlanArtifact {
  const userPrompt = [...messages].reverse().find((message) => message.author === "user")?.text.trim() ?? "";
  const discussion = messages.map((message) => message.text).join("\n").toLowerCase();
  const promptLower = userPrompt.toLowerCase();
  const source = `${promptLower}\n${discussion}`;

  if (!userPrompt) {
    return {
      ...artifact,
      edited: true,
      status: "draft",
      stack: [],
      steps: ["Сначала получить задачу пользователя", "После постановки задачи выбрать стек", "Затем собрать план реализации"],
      projectTree: "Проект будет сформирован после постановки задачи.",
    };
  }

  const isShop = /магазин|e-?commerce|каталог|товар|корзин|оплат|заказ|checkout|витрин/.test(source);
  const needsWow = /вау|wow|анимац|эффект|премиаль|luxury|визуал|дизайн/.test(source);
  const mentionsNext = /next\.?js|next\b/.test(source);
  const mentionsTilda = /tilda|webflow/.test(source);
  const wantsFastNoCode = mentionsTilda && /быстро|без кода|no-code|лендинг/.test(source);

  const stack = wantsFastNoCode
    ? ["Tilda/Webflow", "Figma", "Airtable/Google Sheets", "Tinkoff/ЮKassa", "Telegram/Email заявки"]
    : [
      mentionsNext || isShop ? "Next.js" : "Vite + React",
      "TypeScript",
      needsWow ? "Tailwind CSS + Framer Motion" : "Tailwind CSS",
      isShop ? "Каталог товаров + корзина" : "React Router",
      isShop ? "Stripe/ЮKassa" : "REST/JSON API",
      "Vercel/Cloudflare Pages",
    ];

  const title = isShop
    ? "Интернет-магазин " + extractProjectName(userPrompt, "CrystalManjari")
    : titleFromPrompt(userPrompt);

  const steps = isShop
    ? [
      "Зафиксировать бренд, аудиторию и визуальную концепцию магазина",
      "Спроектировать каталог, фильтры, карточку товара и структуру коллекций",
      "Собрать премиальный UI с адаптивной сеткой, анимациями и вау-эффектами",
      "Реализовать корзину, оформление заказа и интеграцию оплаты",
      "Добавить админский источник товаров и безопасную обработку заявок",
      "Проверить мобильную версию, скорость загрузки, SEO и сценарий покупки",
    ]
    : [
      "Уточнить цель продукта, пользователей и главный пользовательский сценарий",
      "Выбрать стек и архитектуру под задачу",
      "Собрать первый рабочий экран и базовую навигацию",
      "Подключить данные, формы и внешние интеграции",
      "Проверить UX, ошибки, адаптивность и критерии готовности",
    ];

  return {
    ...artifact,
    title,
    stack: unique(stack),
    steps,
    projectTree: renderProjectTree(title, isShop, wantsFastNoCode),
    edited: true,
    status: "draft",
  };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Решение команды";
  return cleaned.length > 56 ? cleaned.slice(0, 53).trimEnd() + "..." : cleaned;
}

function extractProjectName(prompt: string, fallback: string): string {
  const latinName = prompt.match(/[A-Z][A-Za-z0-9-]{2,}/)?.[0];
  return latinName ?? fallback;
}

function renderProjectTree(title: string, isShop: boolean, noCode: boolean): string {
  if (noCode) {
    return `${title}/\n├─ figma/\n├─ content/\n│  ├─ products.csv\n│  └─ brand.md\n├─ tilda-pages/\n└─ launch-checklist.md`;
  }

  if (isShop) {
    return `${title}/\n├─ app/\n│  ├─ page.tsx\n│  ├─ catalog/\n│  ├─ product/[slug]/\n│  ├─ cart/\n│  └─ checkout/\n├─ components/\n│  ├─ product-card.tsx\n│  ├─ hero.tsx\n│  └─ wow-effects.tsx\n├─ lib/\n│  ├─ products.ts\n│  └─ payments.ts\n├─ content/products.json\n└─ README.md`;
  }

  return `${title}/\n├─ src/\n│  ├─ components/\n│  ├─ pages/\n│  ├─ lib/\n│  └─ styles/\n├─ tests/\n├─ docs/\n└─ README.md`;
}
