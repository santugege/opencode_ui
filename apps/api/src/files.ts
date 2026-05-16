import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { FileKind, SessionFile } from "@opencode-ui/shared";
import type { MemoryDatabase } from "./db";
import { isInsideDirectory } from "./workspaces";

export interface FileServiceOptions {
  db: MemoryDatabase;
}

export interface StoreUploadInput {
  sessionId: string;
  name: string;
  mimeType: string;
  bytes: Buffer | Uint8Array;
}

export function inferFileKind(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "text/csv" ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel")
  ) {
    return "spreadsheet";
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/pdf" ||
    mimeType.includes("document") ||
    mimeType.includes("wordprocessingml")
  ) {
    return "document";
  }
  return "other";
}

export function sanitizeUploadName(name: string) {
  if (name !== basename(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("Invalid upload filename");
  }

  const safe = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-");

  if (!safe || safe === "." || safe === "..") {
    throw new Error("Invalid upload filename");
  }

  return safe;
}

export function createFileService(options: FileServiceOptions) {
  return {
    async storeUpload(input: StoreUploadInput): Promise<SessionFile> {
      const session = options.db.findWorkspaceSessionById(input.sessionId);
      if (!session) throw new Error("Workspace session not found");

      const safeName = sanitizeUploadName(input.name);
      const id = `file_${randomUUID().replaceAll("-", "_")}`;
      const relativePath = `uploads/${id}-${safeName}`;
      const absolutePath = resolve(session.workspacePath, relativePath);

      if (!isInsideDirectory(session.workspacePath, absolutePath)) {
        throw new Error("Upload path escaped session workspace");
      }

      await mkdir(resolve(session.workspacePath, "uploads"), { recursive: true });
      await writeFile(absolutePath, input.bytes);

      return options.db.createSessionFile({
        id,
        sessionId: session.id,
        name: input.name,
        kind: inferFileKind(input.mimeType),
        mimeType: input.mimeType,
        size: input.bytes.byteLength,
        relativePath,
        createdAt: new Date().toISOString(),
      });
    },
  };
}
