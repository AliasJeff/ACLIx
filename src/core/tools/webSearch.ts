import { tool } from 'ai';
import { z } from 'zod';

import { configManager } from '../../services/config/index.js';
import { appLogger, errorLogger } from '../../services/logger/index.js';
import type { AgentCallbacks } from '../../shared/types.js';
import { logToolEvent, queryPreview } from './toolEvent.js';

const webSearchInputSchema = z.object({
  query: z.string().min(1).describe('Search keywords for web lookup'),
});

interface TavilyResultItem {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilySearchResponse {
  answer?: string;
  results?: TavilyResultItem[];
}

export function createWebSearchTool(callbacks: AgentCallbacks) {
  return tool({
    description: 'Search the web via Tavily for up-to-date information and documentation.',
    inputSchema: webSearchInputSchema,
    execute: async ({ query }) => {
      logToolEvent('web_search', queryPreview(query));
      const command = `web_search ${query}`;
      const reasoning = 'Fetch recent information from web sources.';
      const risk = 'low' as const;
      const isApproved = callbacks.onBeforeExecute
        ? await callbacks.onBeforeExecute('web_search', command, reasoning, risk)
        : false;

      if (!isApproved) {
        return 'Execution rejected by user. Please suggest an alternative or stop.';
      }

      try {
        const apiKey = configManager.get('tavilyApiKey') ?? process.env.TAVILY_API_KEY;
        if (!apiKey) {
          return 'Web search failed: Missing Tavily API key. Set tavilyApiKey in config or TAVILY_API_KEY env var.';
        }

        appLogger.info({ scope: 'agent', query }, 'Performing web search');

        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: 5,
            include_answer: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return `Web search failed: HTTP ${String(response.status)} ${errorText}`;
        }

        const dataUnknown: unknown = await response.json();
        const data = dataUnknown as TavilySearchResponse;
        const results = Array.isArray(data.results) ? data.results : [];

        appLogger.info(
          { scope: 'agent', resultsCount: data.results?.length },
          'Web search completed',
        );

        return {
          query,
          answer: data.answer ?? '',
          results: results.map((result) => ({
            title: result.title ?? '',
            url: result.url ?? '',
            snippet: result.content ?? '',
          })),
        };
      } catch (error: unknown) {
        errorLogger.error({ tool: 'web_search', error }, 'Tool execution exception');
        const message = error instanceof Error ? error.message : String(error);
        return `Web search failed: ${message}`;
      }
    },
  });
}
