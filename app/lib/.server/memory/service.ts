import { createDeterministicEmbedding } from './embeddings';
import { matchMemories, type MemoryMatch, upsertMemory } from '~/lib/.server/database/client';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('memory.service');

type EnvironmentSource = Env | Record<string, string | undefined> | undefined;

function stableHash(input: string): string {
  let hash = 0;

  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
}

export async function searchRelevantMemories(
  query: string,
  options?: {
    limit?: number;
    chatId?: string | null;
    env?: EnvironmentSource;
  },
): Promise<MemoryMatch[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  try {
    return await matchMemories(
      createDeterministicEmbedding(normalizedQuery),
      {
        matchLimit: options?.limit ?? 6,
        filterChatId: options?.chatId ?? null,
      },
      options?.env,
    );
  } catch (error) {
    logger.error('Failed to search memories', error);
    return [];
  }
}

export async function rememberConversation(input: {
  chatId?: string | null;
  userMessage: string;
  assistantMessage: string;
  summary?: string | null;
  provider?: string;
  model?: string;
  env?: EnvironmentSource;
}) {
  const content = [
    input.summary ? `Summary: ${input.summary}` : '',
    `User: ${input.userMessage}`,
    `Assistant: ${input.assistantMessage}`,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!content) {
    return null;
  }

  const memoryKey = `${input.chatId || 'global'}:${stableHash(content)}`;

  try {
    return await upsertMemory(
      {
        memory_key: memoryKey,
        chat_id: input.chatId ?? null,
        source: 'chat',
        content,
        summary: input.summary ?? null,
        metadata: {
          provider: input.provider ?? null,
          model: input.model ?? null,
        },
        embedding: createDeterministicEmbedding(content),
      },
      input.env,
    );
  } catch (error) {
    logger.error('Failed to store memory', error);
    return null;
  }
}

export function formatMemoryContext(memories: MemoryMatch[]): string {
  if (!memories.length) {
    return '';
  }

  return memories
    .map((memory, index) => {
      const body = memory.summary || memory.content;
      return `[Memory ${index + 1} | similarity ${(memory.similarity ?? 0).toFixed(3)}]\n${body}`;
    })
    .join('\n\n');
}
