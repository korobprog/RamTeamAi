import type { AgentConfig, ChatMessage, PlanArtifact, TopologyConfig } from "../types";
import { isNonBlockingImplementationStep } from "./checklist";

const roleLines: Record<string, string> = {
  architect: "Архитектор связывает требования, доменную модель, границы модулей и технические риски.",
  coder: "Разработчик предлагает реализацию, точки расширения и проверяемые технические решения.",
  critic: "Критик ищет риски, противоречия, слабые места и дорогие ошибки.",
  researcher: "Исследователь проверяет источники, актуальность технологий и внешние ограничения.",
  security: "Безопасность проверяет секреты, права доступа, sandbox и хранение данных.",
  product: "Продукт фокусируется на UX, ценности функции и понятном рабочем потоке.",
  tester: "Тестировщик планирует проверки, регрессию, smoke test и критерии готовности.",
  arbiter: "Арбитр сводит мнения, выбирает итоговый план и останавливает зацикливание.",
};

const TECH_PATTERNS: Array<{ label: string; pattern: RegExp; group?: number }> = [
  { label: "Next.js", pattern: /\bnext(?:\.js)?\b/i },
  { label: "Nuxt", pattern: /\bnuxt\b/i },
  { label: "Astro", pattern: /\bastro\b/i },
  { label: "SvelteKit", pattern: /\bsvelte\s*kit\b|\bsveltekit\b/i },
  { label: "Vue", pattern: /\bvue\b/i },
  { label: "React Native", pattern: /react\s+native/i },
  { label: "Expo", pattern: /\bexpo\b/i },
  { label: "Tauri", pattern: /\btauri\b/i },
  { label: "Electron", pattern: /\belectron\b/i },
  { label: "Vite", pattern: /\bvite\b/i },
  { label: "React", pattern: /\breact\b/i },
  { label: "TypeScript", pattern: /\btypescript\b|\bts\b/i },
  { label: "JavaScript", pattern: /\bjavascript\b|\bjs\b/i },
  { label: "Tailwind CSS", pattern: /\btailwind(?:\s+css)?\b/i },
  { label: "Framer Motion", pattern: /framer\s+motion/i },
  { label: "GSAP", pattern: /\bgsap\b/i },
  { label: "Three.js", pattern: /three(?:\.js)?|webgl/i },
  { label: "Node.js", pattern: /\bnode(?:\.js)?\b/i },
  { label: "Express", pattern: /\bexpress\b/i },
  { label: "NestJS", pattern: /\bnest(?:js)?\b/i },
  { label: "Fastify", pattern: /\bfastify\b/i },
  { label: "Python", pattern: /\bpython\b/i },
  { label: "FastAPI", pattern: /\bfastapi\b/i },
  { label: "Django", pattern: /\bdjango\b/i },
  { label: "Flask", pattern: /\bflask\b/i },
  { label: "Go", pattern: /\bgolang\b|\bgo\s+(?:api|service|backend|server)\b/i },
  { label: "Rust", pattern: /\brust\b/i },
  { label: "PostgreSQL", pattern: /postgres(?:ql)?|\bpg\b/i },
  { label: "MySQL", pattern: /\bmysql\b/i },
  { label: "SQLite", pattern: /\bsqlite\b/i },
  { label: "MongoDB", pattern: /\bmongo(?:db)?\b/i },
  { label: "Redis", pattern: /\bredis\b/i },
  { label: "Prisma", pattern: /\bprisma\b/i },
  { label: "Drizzle", pattern: /\bdrizzle\b/i },
  { label: "Supabase", pattern: /\bsupabase\b/i },
  { label: "Firebase", pattern: /\bfirebase\b/i },
  { label: "Stripe", pattern: /\bstripe\b/i },
  { label: "ЮKassa", pattern: /ю\s?касса|yookassa|ukassa/i },
  { label: "Telegram Bot API", pattern: /telegram|телеграм|бот/i },
  { label: "Docker", pattern: /\bdocker\b/i },
  { label: "Vercel", pattern: /\bvercel\b/i },
  { label: "Cloudflare Pages", pattern: /cloudflare\s+pages/i },
  { label: "Cloudflare Workers", pattern: /cloudflare\s+workers|\bworkers\b/i },
];

const STEP_HEADING_PATTERN = /^\s*(?:#{1,4}\s*)?(?:шаги|план|roadmap|implementation plan|implementation|этапы|задачи)\s*[:：-]?\s*$/i;
const STACK_HEADING_PATTERN = /^\s*(?:#{1,4}\s*)?(?:стек|stack|технологии|технологический стек|tools|инструменты)\s*[:：-]?\s*(.*)$/i;

export async function runPlanningRound(agents: AgentConfig[], topology: TopologyConfig, currentTokens: number, userPrompt = ""): Promise<ChatMessage[]> {
  const activeAgents = topology.kind === "pipeline" ? agents : agents.slice(0, Math.min(agents.length, 3));
  const focus = userPrompt.trim() || "уточнить задачу пользователя и собрать план";
  const topologyNote = topology.kind === "debate"
    ? `Формат debate: сверяю аргументы с другими агентами, максимум ${topology.maxRounds} раундов.`
    : topology.kind === "pipeline"
      ? "Формат pipeline: передаю результат следующему агенту без потери контекста."
      : "Формат supervisor: выполняю подзадачу от ведущего агента.";
  await new Promise((resolve) => window.setTimeout(resolve, 420));

  return activeAgents.map((agent, index) => ({
    id: "round-" + Date.now() + "-" + agent.id,
    author: agent.id,
    agentRole: agent.role,
    text: `${topology.kind === "supervisor" && index > 0 ? agent.name + ": " : ""}${roleLines[agent.role]} Фокус задачи: ${focus}. ${topologyNote}`,
    createdAt: new Date().toISOString(),
    tokens: 740 + Math.round(currentTokens / 10_000) * 20 + index * 80,
    tool: agent.tools.includes("mcp") ? "mcp" : undefined,
  }));
}

export function synthesizePlan(messages: ChatMessage[], artifact: PlanArtifact): PlanArtifact {
  const userPrompt = [...messages].reverse().find((message) => message.author === "user")?.text.trim() ?? "";
  const agentText = messages.filter((message) => message.author !== "user").map((message) => message.text).join("\n");
  const source = `${userPrompt}\n${agentText}`;

  if (!userPrompt) {
    return {
      ...artifact,
      edited: true,
      status: "draft",
      stack: [],
      steps: ["Получить задачу пользователя", "Собрать ограничения и критерии готовности", "После этого выбрать стек и план реализации"],
      projectTree: "Проект будет сформирован после постановки задачи.",
    };
  }

  const stack = buildStack(source, userPrompt);
  const title = titleFromPrompt(userPrompt);
  const steps = buildSteps(messages, title, stack);

  return {
    ...artifact,
    title,
    stack,
    steps,
    projectTree: renderProjectTree(title, stack, source),
    edited: true,
    status: "draft",
  };
}

function buildStack(source: string, userPrompt: string): string[] {
  const explicit = extractExplicitStackItems(source);
  const mentioned = extractMentionedTech(source);
  const fallback = fallbackStack(userPrompt, source);
  const stack = unique([...explicit, ...mentioned, ...fallback]);
  return normalizeStack(stack).slice(0, 8);
}

function extractExplicitStackItems(text: string): string[] {
  const items: string[] = [];
  const lines = text.split(/\r?\n/);
  let readingStack = false;

  for (const line of lines) {
    const heading = line.match(STACK_HEADING_PATTERN);
    if (heading) {
      readingStack = true;
      items.push(...splitStackItems(heading[1] ?? ""));
      continue;
    }

    if (readingStack) {
      if (!line.trim()) {
        readingStack = false;
        continue;
      }
      if (/^\s*(?:#{1,4}\s*)?[А-ЯA-Z][\wа-яА-Я\s]{2,}\s*[:：-]?\s*$/.test(line) && !/^\s*[-*•\d]/.test(line)) {
        readingStack = false;
        continue;
      }
      const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
      if (bullet) items.push(...splitStackItems(bullet[1]));
    }
  }

  return items.filter(isLikelyTechName).map(normalizeTechLabel);
}

function splitStackItems(raw: string): string[] {
  return raw
    .replace(/^[:：-]+/, "")
    .split(/[,;|/]|\s+\+\s+/)
    .map((item) => item.replace(/\([^)]*\)/g, "").trim())
    .filter(Boolean);
}

function isLikelyTechName(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 36) return false;
  if (/^(и|или|для|без|с|на|под|как)$/i.test(text)) return false;
  return /[A-Za-z0-9.#/+]|[А-Яа-я]/.test(text);
}

function extractMentionedTech(source: string): string[] {
  return TECH_PATTERNS
    .filter((item) => item.pattern.test(source))
    .sort((a, b) => indexOfPattern(source, a.pattern) - indexOfPattern(source, b.pattern))
    .map((item) => item.label);
}

function indexOfPattern(source: string, pattern: RegExp): number {
  const match = source.match(pattern);
  return match?.index ?? Number.MAX_SAFE_INTEGER;
}

function fallbackStack(userPrompt: string, source: string): string[] {
  const lower = source.toLowerCase();
  const isShop = /магазин|e-?commerce|каталог|товар|корзин|оплат|заказ|checkout|витрин|продаж|продав/.test(lower);
  const isLanding = /лендинг|landing|сайт|портфолио|визитк|промо/.test(lower);
  const isMobile = /mobile|мобильн|ios|android|приложени[ея]/.test(lower);
  const isDesktop = /desktop|десктоп|tauri|electron|windows|macos/.test(lower);
  const isBot = /telegram|телеграм|бот|discord/.test(lower);
  const isBackend = /api|backend|бэкенд|сервер|микросервис|crm|админ/.test(lower);
  const wantsDesign = /дизайн|анимац|вау|wow|премиаль|эффект|интерактив/.test(lower);
  const wantsNoCode = /tilda|webflow|no-code|без кода|быстро/.test(lower);

  if (wantsNoCode) return ["Tilda/Webflow", "Figma", "Airtable/Google Sheets", "ЮKassa/Stripe", "Telegram/Email заявки"];
  if (isDesktop) return ["Tauri 2", "React", "TypeScript", "SQLite", "OS keychain"];
  if (isMobile) return ["Expo", "React Native", "TypeScript", "Zustand", "Firebase/Supabase"];
  if (isBot) return ["Node.js", "TypeScript", "Telegram Bot API", "PostgreSQL", "Redis"];
  if (isBackend && !isLanding) return ["Node.js", "TypeScript", "Fastify/NestJS", "PostgreSQL", "Docker"];
  if (isShop) return ["Next.js", "TypeScript", "Tailwind CSS", "PostgreSQL", "Stripe/ЮKassa", "Vercel"];
  if (isLanding || wantsDesign || userPrompt) return ["Vite", "React", "TypeScript", wantsDesign ? "Tailwind CSS + Framer Motion" : "Tailwind CSS", "Vercel/Cloudflare Pages"];
  return ["Vite", "React", "TypeScript"];
}

function normalizeStack(items: string[]): string[] {
  let normalized = unique(items.map(normalizeTechLabel));
  const hasNext = normalized.includes("Next.js");
  const hasReactNative = normalized.includes("React Native");

  if (hasNext) normalized = normalized.filter((item) => item !== "Vite");
  if (hasReactNative) normalized = normalized.filter((item) => item !== "React");
  if (normalized.includes("Tailwind CSS + Framer Motion")) {
    normalized = normalized.filter((item) => item !== "Tailwind CSS" && item !== "Framer Motion");
  }
  return normalized;
}

function normalizeTechLabel(item: string): string {
  const value = item.trim().replace(/\s+/g, " ");
  const known = TECH_PATTERNS.find((entry) => entry.pattern.test(value));
  return known?.label ?? value.replace(/^[-*•\d.)\s]+/, "");
}

function buildSteps(messages: ChatMessage[], title: string, stack: string[]): string[] {
  const extracted = extractExplicitSteps(messages);
  if (extracted.length >= 2) return extracted.slice(0, 8);

  const mainTech = stack[0] ?? "выбранном стеке";
  return [
    `Зафиксировать цель, аудиторию, ограничения и критерии готовности для «${title}»`,
    `Согласовать архитектуру и стек: ${stack.slice(0, 4).join(", ") || mainTech}`,
    `Собрать минимальный рабочий каркас на ${mainTech} с навигацией и базовыми состояниями`,
    "Подключить данные, формы, интеграции и обработку ошибок только для нужных сценариев",
    "Проверить UX, адаптивность, безопасность конфигурации и сценарии запуска",
  ];
}

function extractExplicitSteps(messages: ChatMessage[]): string[] {
  const steps: string[] = [];

  for (const message of messages.filter((item) => item.author !== "user")) {
    const lines = message.text.split(/\r?\n/);
    let readingSteps = false;

    for (const line of lines) {
      if (STEP_HEADING_PATTERN.test(line)) {
        readingSteps = true;
        continue;
      }

      const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
      if (readingSteps && bullet) {
        const normalized = cleanupStep(bullet[1]);
        if (normalized) steps.push(normalized);
        continue;
      }

      if (readingSteps && !line.trim()) readingSteps = false;
    }
  }

  return unique(steps).filter((step) => step.length >= 12 && step.length <= 180);
}

function cleanupStep(step: string): string {
  let cleaned = step.replace(/^[\[\]x\s-]+/i, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (/^(stack|стек|технологии)\b/i.test(cleaned)) return "";
  cleaned = cleaned
    .replace(/\s*(?:,|;|—|-)?\s*(?:затем|после этого|и)\s+(?:запустить|запусти|проверить|прогнать)\s+`?(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|build|test|lint|check)`?.*$/i, "")
    .replace(/\s*(?:,|;|—|-)?\s*(?:затем|после этого|и)\s+проверить\s+(?:сборку|тесты|smoke).*$/i, "")
    .replace(/\s*(?:,|;|—|-)?\s*(?:затем|после этого|и)\s+запустить\s+(?:dev|build|test|lint).*$/i, "")
    .trim();
  if (!cleaned || isNonBlockingImplementationStep(cleaned)) return "";
  return cleaned.replace(/[.;]+$/, "");
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/^\/init\s*/i, "").split(/\r?\n/)[0]?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Решение команды";
  const withoutPolitePrefix = cleaned.replace(/^(сделай|создай|разработай|построй|нужен|нужна|нужно)\s+/i, "");
  return withoutPolitePrefix.length > 56 ? withoutPolitePrefix.slice(0, 53).trimEnd() + "..." : withoutPolitePrefix;
}

function renderProjectTree(title: string, stack: string[], source: string): string {
  const root = safeFolderName(title);
  const lower = source.toLowerCase();
  const hasNext = stack.includes("Next.js");
  const hasMobile = stack.includes("React Native") || stack.includes("Expo");
  const hasDesktop = stack.some((item) => ["Tauri", "Tauri 2", "Electron"].includes(item));
  const hasBackend = stack.some((item) => ["Fastify", "NestJS", "Express", "FastAPI", "Django"].includes(item)) || /api|backend|бэкенд|сервер/.test(lower);
  const hasBot = stack.includes("Telegram Bot API");

  if (hasMobile) {
    return `${root}/\n├─ app/\n├─ src/\n│  ├─ components/\n│  ├─ features/\n│  ├─ api/\n│  └─ store/\n├─ assets/\n└─ tests/`;
  }

  if (hasDesktop) {
    return `${root}/\n├─ src/\n│  ├─ components/\n│  ├─ screens/\n│  ├─ lib/\n│  └─ store/\n├─ src-tauri/\n├─ docs/\n└─ tests/`;
  }

  if (hasBot) {
    return `${root}/\n├─ src/\n│  ├─ bot/\n│  ├─ commands/\n│  ├─ services/\n│  └─ storage/\n├─ docs/\n└─ tests/`;
  }

  if (hasBackend && !hasNext) {
    return `${root}/\n├─ src/\n│  ├─ routes/\n│  ├─ services/\n│  ├─ db/\n│  └─ config/\n├─ docker/\n├─ docs/\n└─ tests/`;
  }

  if (hasNext) {
    return `${root}/\n├─ app/\n│  ├─ page.tsx\n│  ├─ layout.tsx\n│  └─ api/\n├─ components/\n├─ lib/\n├─ content/\n└─ tests/`;
  }

  return `${root}/\n├─ src/\n│  ├─ components/\n│  ├─ pages/\n│  ├─ lib/\n│  └─ styles/\n├─ tests/\n├─ docs/\n└─ README.md`;
}

function safeFolderName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/^-|-$/g, "") || "project";
}
