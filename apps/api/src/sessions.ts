import { randomUUID } from "node:crypto";
import type { WorkspaceSession } from "@opencode-ui/shared";
import type { MemoryDatabase } from "./db";
import type { createWorkspaceManager } from "./workspaces";

type WorkspaceManager = ReturnType<typeof createWorkspaceManager>;

export interface SessionServiceOptions {
  db: MemoryDatabase;
  workspaces: WorkspaceManager;
}

export interface CreatePendingSessionInput {
  userId: string;
  title: string;
}

export function createSessionService(options: SessionServiceOptions) {
  return {
    async createPendingSession(input: CreatePendingSessionInput): Promise<WorkspaceSession> {
      const now = new Date().toISOString();
      const id = randomUUID();
      const workspace = await options.workspaces.createSessionWorkspace({
        userId: input.userId,
        sessionId: id,
      });

      return options.db.createWorkspaceSession({
        id,
        userId: input.userId,
        opencodeSessionId: null,
        title: input.title,
        status: "ready",
        workspacePath: workspace.absolutePath,
        createdAt: now,
        updatedAt: now,
      });
    },

    bindOpencodeSession(input: { sessionId: string; opencodeSessionId: string }) {
      const existing = options.db.findWorkspaceSessionById(input.sessionId);
      if (!existing) throw new Error("Workspace session not found");

      return options.db.updateWorkspaceSession({
        ...existing,
        opencodeSessionId: input.opencodeSessionId,
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
