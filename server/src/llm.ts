import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}
export interface LlmRequest {
  system: { stable: string; dynamic: string };
  messages: LlmMessage[];
  maxTokens: number;
}
export interface LlmResult {
  text: string;
  refused?: boolean;
}

// Pluggable text provider. To use another model/vendor, implement this interface
// and register it in `providers` below, then set LLM_PROVIDER=<name>.
export interface LlmProvider {
  complete(req: LlmRequest): Promise<LlmResult>;
}

class AnthropicProvider implements LlmProvider {
  private client = new Anthropic();

  async complete(req: LlmRequest): Promise<LlmResult> {
    const response = await this.client.beta.messages.create({
      model: config.llm.model,
      max_tokens: req.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      // On a policy decline the API retries on a suitable fallback model inside the same call.
      fallbacks: "default",
      output_config: { effort: config.llm.effort },
      system: [
        // Persona + rules are stable per character, so they are cached; memory goes after the breakpoint.
        { type: "text", text: req.system.stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: req.system.dynamic },
      ],
      messages: req.messages,
    });
    if (response.stop_reason === "refusal") return { text: "", refused: true };
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return { text };
  }
}

// Works without any API key, so the whole funnel can be tested for free.
class MockProvider implements LlmProvider {
  async complete(req: LlmRequest): Promise<LlmResult> {
    if (req.system.dynamic.includes("MEMORY_EXTRACTION")) return { text: "[]" };
    const lines = [
      "Ха, ты сегодня в настроении 😊 Рассказывай, как прошёл день?",
      "Слушай, а ты всегда такой загадочный? Мне нравится.",
      "Я как раз думала о тебе. Заходи вечером на набережную?",
      "Не отвлекай, я работаю… ладно, отвлекай 😏",
    ];
    return { text: `${lines[Math.floor(Math.random() * lines.length)]} (демо-режим: подключи ANTHROPIC_API_KEY)` };
  }
}

const providers: Record<string, () => LlmProvider> = {
  anthropic: () => new AnthropicProvider(),
  mock: () => new MockProvider(),
};

const factory = providers[config.llm.provider];
if (!factory) throw new Error(`Unknown LLM_PROVIDER: ${config.llm.provider}`);
export const llm: LlmProvider = factory();
