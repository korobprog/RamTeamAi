import { isTauriRuntime, safeInvoke } from "../lib/tauri";
import type { AgentConfig, ChatMessage, ModelApiFormat, ProviderConfig } from "../types";

export interface UnifiedChatRequest { provider: ProviderConfig; model: string; messages: Pick<ChatMessage, "author" | "text">[]; stream: boolean; }
export interface ProviderTestResult { ok: boolean; latencyMs: number; message: string; }
export interface CompletionResult { text: string; latencyMs: number; tokens: number; }

const TEST_MESSAGES = {
  invalidUrl: "\u041e\u0448\u0438\u0431\u043a\u0430: Base URL \u0434\u043e\u043b\u0436\u0435\u043d \u043d\u0430\u0447\u0438\u043d\u0430\u0442\u044c\u0441\u044f \u0441 http:// \u0438\u043b\u0438 https://",
  noKey: "\u041e\u0448\u0438\u0431\u043a\u0430: \u0441\u043d\u0430\u0447\u0430\u043b\u0430 \u0434\u043e\u0431\u0430\u0432\u044c API key",
  warning: "\u0414\u043e\u0441\u0442\u0443\u043f\u0435\u043d, \u043d\u043e \u043a\u043b\u044e\u0447 \u0438\u043b\u0438 scope \u043d\u0443\u0436\u043d\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c",
  ok: "\u0422\u0435\u0441\u0442 \u043f\u0440\u043e\u0448\u0451\u043b \u0443\u0441\u043f\u0435\u0448\u043d\u043e",
};

const nodeRuntimeSecrets = new Map<string, string>();

function runtimeSecrets(): Map<string, string> {
  if (typeof window === "undefined") return nodeRuntimeSecrets;
  const globalWindow = window as typeof window & { __RamTeamAiRuntimeSecrets?: Map<string, string> };
  globalWindow.__RamTeamAiRuntimeSecrets ??= new Map<string, string>();
  return globalWindow.__RamTeamAiRuntimeSecrets;
}

export function rememberProviderSecret(providerId: string, secret: string): void {
  runtimeSecrets().set(providerId, secret);
}

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll("{{" + key + "}}", value), template);
}

function baseUrl(provider: ProviderConfig): string {
  return provider.baseUrl.replace(/\/+$/, "");
}

export function modelApiFormat(provider: ProviderConfig, modelId: string): ModelApiFormat {
  if (provider.kind === "anthropic") return "anthropic";
  const model = provider.models.find((item) => item.id === modelId);
  return model?.apiFormat ?? "chat-completions";
}

function RamTeamAiRequiresStream(provider: ProviderConfig, format: ModelApiFormat | "ollama" | "gemini"): boolean {
  return provider.kind === "RamTeamAi" && (format === "anthropic" || format === "responses");
}

export function buildProviderPayload(request: UnifiedChatRequest): { url: string; body: string; streamKind: string } {
  const messages = JSON.stringify(request.messages.map((message) => ({ role: message.author === "user" ? "user" : "assistant", content: message.text })));
  const format = modelApiFormat(request.provider, request.model);
  if (format === "anthropic") return { url: baseUrl(request.provider) + "/messages", streamKind: request.provider.stream, body: JSON.stringify({ model: request.model, max_tokens: 4096, stream: request.stream, messages: JSON.parse(messages) }, null, 2) };
  if (format === "responses") return { url: baseUrl(request.provider) + "/responses", streamKind: request.provider.stream, body: JSON.stringify({ model: request.model, input: JSON.parse(messages), store: false, stream: request.stream }, null, 2) };
  if (request.provider.kind === "ollama") return { url: baseUrl(request.provider) + "/chat", streamKind: request.provider.stream, body: JSON.stringify({ model: request.model, stream: request.stream, messages: JSON.parse(messages) }, null, 2) };
  const template = request.provider.requestTemplate ?? '{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }';
  return { url: baseUrl(request.provider) + "/chat/completions", streamKind: request.provider.stream, body: interpolate(template, { model: request.model, messages, stream: String(request.stream) }) };
}

function conversationMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const normalized = messages.map((message) => ({
    role: message.author === "user" ? "user" as const : "assistant" as const,
    content: message.text,
  }));
  return normalized.length ? normalized : [{ role: "user", content: "Continue." }];
}

function requestForAgent(provider: ProviderConfig, agent: AgentConfig, messages: ChatMessage[]): { url: string; body: unknown; format: ModelApiFormat | "ollama" | "gemini" } {
  const format = modelApiFormat(provider, agent.modelId);
  const conversation = conversationMessages(messages);
  const stream = RamTeamAiRequiresStream(provider, format);

  if (format === "anthropic") {
    return {
      url: baseUrl(provider) + "/messages",
      format,
      body: {
        model: agent.modelId,
        max_tokens: Math.min(agent.tokenBudget, 4096),
        system: agent.systemPrompt,
        stream,
        messages: conversation,
      },
    };
  }

  if (format === "responses") {
    return {
      url: baseUrl(provider) + "/responses",
      format,
      body: {
        model: agent.modelId,
        instructions: agent.systemPrompt,
        input: conversation,
        max_output_tokens: Math.min(agent.tokenBudget, 4096),
        store: false,
        stream,
      },
    };
  }

  if (provider.kind === "ollama") {
    return {
      url: baseUrl(provider) + "/chat",
      format: "ollama",
      body: {
        model: agent.modelId,
        stream: false,
        messages: [{ role: "system", content: agent.systemPrompt }, ...conversation],
      },
    };
  }

  return {
    url: baseUrl(provider) + "/chat/completions",
    format,
    body: {
      model: agent.modelId,
      stream: false,
      messages: [{ role: "system", content: agent.systemPrompt }, ...conversation],
    },
  };
}

function textFromResponse(format: ModelApiFormat | "ollama" | "gemini", value: unknown): string | undefined {
  const data = value as {
    choices?: { message?: { content?: string }; text?: string }[];
    content?: { text?: string }[];
    message?: { content?: string };
    output_text?: string;
    output?: { content?: { text?: string }[] }[];
  };

  if (format === "anthropic") return data.content?.map((item) => item.text ?? "").join("").trim() || undefined;
  if (format === "responses") {
    if (data.output_text) return data.output_text;
    return data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("").trim() || undefined;
  }
  if (format === "ollama") return data.message?.content;
  return data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
}

function textFromSse(format: ModelApiFormat | "ollama" | "gemini", raw: string): string | undefined {
  let text = "";
  let fallback: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      const event = JSON.parse(payload) as {
        type?: string;
        delta?: string | { text?: string };
        choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        response?: unknown;
        message?: unknown;
      };
      const chunk =
        (typeof event.delta === "string" ? event.delta : event.delta?.text) ??
        event.choices?.[0]?.delta?.content ??
        event.choices?.[0]?.message?.content ??
        (event.response ? textFromResponse(format, event.response) : undefined) ??
        (event.message ? textFromResponse(format, event.message) : undefined) ??
        textFromResponse(format, event);

      if (!chunk) continue;
      if (event.type === "response.completed" || event.type?.endsWith(".done")) {
        fallback ??= chunk;
      } else {
        text += chunk;
      }
    } catch {
      // Ignore malformed SSE lines.
    }
  }

  return text || fallback;
}

async function completeWithBrowserFetch(provider: ProviderConfig, agent: AgentConfig, messages: ChatMessage[]): Promise<CompletionResult> {
  if (provider.status === "not-configured") {
    throw new Error("\u041d\u0435\u0442 API \u043a\u043b\u044e\u0447\u0430: \u043e\u0442\u043a\u0440\u043e\u0439 \u00ab\u041f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u044b\u00bb \u0438 \u0434\u043e\u0431\u0430\u0432\u044c \u043a\u043b\u044e\u0447 \u0434\u043b\u044f " + provider.name + ".");
  }

  const secret = runtimeSecrets().get(provider.id);
  if (provider.auth !== "none" && !secret) {
    throw new Error("\u041a\u043b\u044e\u0447 \u0435\u0441\u0442\u044c \u0432 OS keychain, \u043d\u043e web dev-\u043e\u043a\u043d\u043e \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0435\u0433\u043e \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0442\u044c. \u0417\u0430\u043f\u0443\u0441\u0442\u0438 Tauri-\u043e\u043a\u043d\u043e \u0438\u043b\u0438 \u0432\u0441\u0442\u0430\u0432\u044c \u043a\u043b\u044e\u0447 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0432 \u044d\u0442\u043e\u0439 web-\u0441\u0435\u0441\u0441\u0438\u0438.");
  }

  const started = performance.now();
  const request = requestForAgent(provider, agent, messages);
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (secret) {
    if (provider.kind === "anthropic") {
      headers["x-api-key"] = secret;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.authorization = "Bearer " + secret;
      if (request.format === "anthropic") headers["anthropic-version"] = "2023-06-01";
    }
  }

  const response = await fetch(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(request.body),
  });
  const raw = await response.text();

  if (!response.ok) {
    throw new Error("RamTeamAi вернул " + response.status + ": " + raw.slice(0, 600));
  }

  const text = raw.split(/\r?\n/).some((line) => line.trimStart().startsWith("data:"))
    ? textFromSse(request.format, raw)
    : textFromResponse(request.format, JSON.parse(raw) as unknown);
  if (!text) throw new Error("\u0412 \u043e\u0442\u0432\u0435\u0442\u0435 RamTeamAi \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d \u0442\u0435\u043a\u0441\u0442.");

  return {
    text,
    latencyMs: Math.round(performance.now() - started),
    tokens: Math.max(1, Math.ceil(text.length / 4)),
  };
}

export async function testProviderConnection(provider: ProviderConfig): Promise<ProviderTestResult> {
  const started = performance.now();
  await new Promise((resolve) => window.setTimeout(resolve, 180 + Math.random() * 260));
  const latencyMs = Math.round(performance.now() - started);
  if (!provider.baseUrl.startsWith("http")) return { ok: false, latencyMs, message: TEST_MESSAGES.invalidUrl };
  if (provider.status === "not-configured") return { ok: false, latencyMs, message: TEST_MESSAGES.noKey };
  return { ok: true, latencyMs, message: provider.status === "warning" ? TEST_MESSAGES.warning : TEST_MESSAGES.ok };
}

export async function completeWithProvider(provider: ProviderConfig, agent: AgentConfig, messages: ChatMessage[]): Promise<CompletionResult> {
  return safeInvoke<CompletionResult>(
    "complete_chat_with_provider",
    { provider, agent, messages },
    async (error) => {
      if (isTauriRuntime()) throw error;
      return await completeWithBrowserFetch(provider, agent, messages);
    },
  );
}

export function maskSecret(secret: string): string {
  if (secret.length < 8) return "\u2022\u2022\u2022\u2022";
  return secret.slice(0, 4) + "\u2022\u2022\u2022" + secret.slice(-4);
}
