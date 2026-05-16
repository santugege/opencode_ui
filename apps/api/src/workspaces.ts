import { mkdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export interface WorkspaceManagerOptions {
  root: string;
}

export interface CreateSessionWorkspaceInput {
  userId: string;
  sessionId: string;
}

export interface SessionWorkspace {
  absolutePath: string;
  relativePath: string;
}

const identifierPattern = /^[A-Za-z0-9_-]+$/;

function assertWorkspaceIdentifier(value: string) {
  if (!identifierPattern.test(value)) {
    throw new Error("Invalid workspace identifier");
  }
}

export function isInsideDirectory(parent: string, child: string) {
  const relativePath = relative(resolve(parent), resolve(child));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${sep}`);
}

export function createWorkspaceManager(options: WorkspaceManagerOptions) {
  const root = resolve(options.root);

  return {
    root,

    async createSessionWorkspace(input: CreateSessionWorkspaceInput): Promise<SessionWorkspace> {
      assertWorkspaceIdentifier(input.userId);
      assertWorkspaceIdentifier(input.sessionId);

      const relativePath = `${input.userId}/${input.sessionId}`;
      const absolutePath = resolve(root, input.userId, input.sessionId);
      if (!isInsideDirectory(root, absolutePath)) {
        throw new Error("Workspace path escaped storage root");
      }

      await mkdir(absolutePath, { recursive: true });
      return {
        absolutePath,
        relativePath,
      };
    },
  };
}
