import { pathToFileURL } from "node:url";
import { createOpencodeClient } from "@opencode-ai/sdk";

export interface OpencodeApiError {
  status: number;
  message: string;
  retryable: boolean;
}

export interface PromptAttachmentInput {
  absolutePath: string;
  mimeType: string;
  filename: string;
}

export interface OpencodeSessionBinding {
  appSessionId: string;
  opencodeSessionId: string;
  workspacePath: string;
}

export type CreateOpencodeClient = (config: {
  baseUrl: string;
  directory: string;
  throwOnError: true;
}) => {
  global?: {
    health?: () => Promise<unknown>;
  };
  session: Partial<{
    create: (input: { body: { title: string } }) => Promise<{ data: { id: string; title?: string } }>;
    prompt: (input: {
      path: { id: string };
      body: {
        parts: Array<
          | { type: "file"; mime: string; filename: string; url: string }
          | { type: "text"; text: string }
        >;
      };
    }) => Promise<unknown>;
  }>;
};

export interface OpencodeWorkspaceClientInput {
  baseUrl: string;
  workspacePath: string;
  createClient?: CreateOpencodeClient;
}

const defaultCreateClient = createOpencodeClient as CreateOpencodeClient;

export function opencodeForWorkspace(input: OpencodeWorkspaceClientInput) {
  return (input.createClient ?? defaultCreateClient)({
    baseUrl: input.baseUrl,
    directory: input.workspacePath,
    throwOnError: true,
  });
}

export async function createOpencodeSession(
  input: OpencodeWorkspaceClientInput & {
    title: string;
  },
) {
  try {
    const client = opencodeForWorkspace(input);
    if (!client.session.create) throw new Error("Opencode client does not expose session.create.");
    const result = await client.session.create({ body: { title: input.title } });
    return result.data;
  } catch (error) {
    throw mapOpencodeError(error);
  }
}

export async function sendPrompt(
  input: OpencodeWorkspaceClientInput & {
    opencodeSessionId: string;
    text: string;
    files: PromptAttachmentInput[];
  },
) {
  try {
    const client = opencodeForWorkspace(input);
    if (!client.session.prompt) throw new Error("Opencode client does not expose session.prompt.");
    return await client.session.prompt({
      path: { id: input.opencodeSessionId },
      body: {
        parts: [
          ...input.files.map((file) => ({
            type: "file" as const,
            mime: file.mimeType,
            filename: file.filename,
            url: pathToFileURL(file.absolutePath).href,
          })),
          { type: "text" as const, text: input.text },
        ],
      },
    });
  } catch (error) {
    throw mapOpencodeError(error);
  }
}

export async function checkOpencodeHealth(
  input: OpencodeWorkspaceClientInput & {
    workspacePath: string;
  },
) {
  const client = opencodeForWorkspace(input);
  if (!client.global?.health) {
    throw {
      status: 500,
      message: "Opencode client does not expose a health endpoint.",
      retryable: false,
    } satisfies OpencodeApiError;
  }
  return await client.global.health();
}

export function mapOpencodeError(error: unknown): OpencodeApiError {
  const status =
    typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status
      : 502;
  const message = error instanceof Error ? error.message : "Opencode request failed.";

  return {
    status,
    message,
    retryable: status === 408 || status === 409 || status === 425 || status === 429 || status >= 500,
  };
}
