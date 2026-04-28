import { randomUUID } from 'node:crypto';

import { saveToolOutput } from '../../services/database/index.js';

const OUTPUT_MAX_LENGTH = 2_000;
const OUTPUT_HEAD_LENGTH = 1_000;
const OUTPUT_TAIL_LENGTH = 500;

export function formatToolOutput(toolName: string, rawContent: string): string {
  void toolName;
  if (rawContent.length <= OUTPUT_MAX_LENGTH) {
    return rawContent;
  }

  const outputId = randomUUID();
  saveToolOutput(outputId, rawContent);
  const head = rawContent.slice(0, OUTPUT_HEAD_LENGTH);
  const tail = rawContent.slice(-OUTPUT_TAIL_LENGTH);

  return `${head}\n\n... [Output truncated to save tokens. Full output saved with ID: ${outputId}]. Use 'read_tool_output' tool with this ID to read more lines. ...\n\n${tail}`;
}
