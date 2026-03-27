export interface LlmProvider {
  complete(prompt: string): string;
}

export class StubLlmProvider implements LlmProvider {
  complete(prompt: string): string {
    return `llm provider stub response: ${prompt}`;
  }
}
