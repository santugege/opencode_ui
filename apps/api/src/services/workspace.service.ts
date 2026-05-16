import { mkdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

/**
 * 所有用户工作区使用的文件系统根目录。
 */
export interface WorkspaceManagerOptions {
  /** 用于存储工作区的绝对或相对根目录。 */
  root: string;
}

/**
 * 创建会话专属工作区所需的入参。
 */
export interface CreateSessionWorkspaceInput {
  /** 拥有该工作区的用户 ID。 */
  userId: string;
  /** 用于隔离上传文件和 opencode 状态的应用会话 ID。 */
  sessionId: string;
}

/**
 * 工作区创建完成后返回的文件系统路径。
 */
export interface SessionWorkspace {
  /** 作为工作区目录传给 opencode 的绝对路径。 */
  absolutePath: string;
  /** 相对配置存储根目录的路径。 */
  relativePath: string;
}

const identifierPattern = /^[A-Za-z0-9_-]+$/;

function assertWorkspaceIdentifier(value: string) {
  if (!identifierPattern.test(value)) {
    throw new Error("Invalid workspace identifier");
  }
}

/**
 * 校验子路径在解析后仍位于父目录内。
 */
export function isInsideDirectory(parent: string, child: string) {
  const relativePath = relative(resolve(parent), resolve(child));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !relativePath.includes(`..${sep}`);
}

/**
 * 创建并校验用户/会话工作区目录。
 */
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

export type WorkspaceManager = ReturnType<typeof createWorkspaceManager>;
