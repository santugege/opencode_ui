import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError } from "../app/errors";
import { serializeFile } from "../presenters/serializers";
import type { AuthService } from "../services/auth.service";
import type { FileService } from "../services/file.service";
import type { OpencodeGateway } from "../services/opencode.service";
import { requireCurrentUser } from "./guards";

/**
 * 文件路由需要的依赖。
 */
export interface FileRoutesOptions {
  /** 用于解析路由资源归属的认证服务。 */
  auth: AuthService;
  /** 将上传字节写入工作区的文件服务。 */
  files: FileService;
  /** 用于按当前用户工作区校验 opencode 会话归属。 */
  opencode: OpencodeGateway;
}

interface SessionParams {
  /** URL 中的 opencode 会话 ID。 */
  sessionId: string;
}

interface UploadFileBody {
  /** Base64 编码的文件内容。 */
  contentBase64?: string;
  /** 浏览器提供的 MIME 类型。 */
  mimeType?: string;
  /** 浏览器提供的原始文件名。 */
  name?: string;
}

/**
 * 注册文件上传路由。
 */
export const filesRoutes: FastifyPluginAsync<FileRoutesOptions> = async (app, options) => {
  app.post<{ Body: UploadFileBody; Params: SessionParams }>("/sessions/:sessionId/files", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    const sessions = await options.opencode.listSessions({ workspacePath: current.user.workspacePath });
    const session = sessions.find((candidate) => candidate.id === request.params.sessionId);
    if (!session) throw new ApiHttpError(404, "Session not found.");

    const body = request.body ?? {};
    if (
      typeof body.contentBase64 !== "string" ||
      typeof body.mimeType !== "string" ||
      typeof body.name !== "string" ||
      !body.contentBase64 ||
      !body.mimeType ||
      !body.name
    ) {
      throw new ApiHttpError(400, "File name, MIME type, and content are required.");
    }

    const file = await options.files.storeUpload({
      bytes: Buffer.from(body.contentBase64, "base64"),
      mimeType: body.mimeType,
      name: body.name,
      sessionId: session.id,
      workspacePath: current.user.workspacePath,
    });

    reply.code(201);
    return { file: serializeFile(file) };
  });
};
