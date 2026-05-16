import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { FileKind, SessionFile } from "@opencode-ui/shared";
import type { MemoryDatabase } from "../repositories/memory.repository";
import { isInsideDirectory } from "./workspace.service";

/**
 * 文件服务需要的依赖。
 */
export interface FileServiceOptions {
  /** 用于解析会话归属并持久化文件元数据的仓储。 */
  db: MemoryDatabase;
}

/**
 * 文件服务接收的已校验上传载荷。
 */
export interface StoreUploadInput {
  /** 拥有该上传文件的应用会话。 */
  sessionId: string;
  /** 浏览器提供的原始文件名。 */
  name: string;
  /** 浏览器提供的 MIME 类型。 */
  mimeType: string;
  /** 从 API 请求中解码出的原始文件字节。 */
  bytes: Buffer | Uint8Array;
}

/**
 * 将 MIME 类型映射为 UI 使用的粗粒度文件分类。
 */
export function inferFileKind(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "text/csv" || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
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

/**
 * 将上传文件名转换为可安全存储的 basename。
 */
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

/**
 * 创建文件服务，并将上传内容存储到会话工作区内。
 */
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

export type FileService = ReturnType<typeof createFileService>;
