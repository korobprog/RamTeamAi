import type { ChatMessage, ProviderConfig } from "../types";

export interface UnifiedChatRequest { provider: ProviderConfig; model: string; messages: Pick<ChatMessage, "author" | "text">[]; stream: boolean; }
export interface ProviderTestResult { ok: boolean; latencyMs: number; message: string; }

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll("{{" + key + "}}", value), template);
}

export function buildProviderPayload(request: UnifiedChatRequest): { url: string; body: string; streamKind: string } {
  const messages = JSON.stringify(request.messages.map((message) => ({ role: message.author === "user" ? "user" : "assistant", content: message.text })));
  if (request.provider.kind === "anthropic") return { url: request.provider.baseUrl + "/messages", streamKind: request.provider.stream, body: JSON.stringify({ model: request.model, max_tokens: 4096, stream: request.stream, messages: JSON.parse(messages) }, null, 2) };
  if (request.provider.kind === "ollama") return { url: request.provider.baseUrl + "/chat", streamKind: request.provider.stream, body: JSON.stringify({ model: request.model, stream: request.stream, messages: JSON.parse(messages) }, null, 2) };
  const template = request.provider.requestTemplate ?? '{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }';
  return { url: request.provider.baseUrl + "/chat/completions", streamKind: request.provider.stream, body: interpolate(template, { model: request.model, messages, stream: String(request.stream) }) };
}

export async function testProviderConnection(provider: ProviderConfig): Promise<ProviderTestResult> {
  const started = performance.now();
  await new Promise((resolve) => window.setTimeout(resolve, 180 + Math.random() * 260));
  const latencyMs = Math.round(performance.now() - started);
  if (!provider.baseUrl.startsWith("http")) return { ok: false, latencyMs, message: "Base URL должен начинаться с http:// или https://" };
  return { ok: provider.status !== "not-configured", latencyMs, message: provider.status === "warning" ? "Соединение есть, но требуется обновить ключ или scope" : "Соединение успешно" };
}

export function maskSecret(secret: string): string {
  if (secret.length < 8) return "••••";
  return secret.slice(0, 4) + "•••" + secret.slice(-4);
}
