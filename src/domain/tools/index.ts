import { z } from 'zod';

export const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export type ToolDefinition = z.infer<typeof toolSchema>;

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
