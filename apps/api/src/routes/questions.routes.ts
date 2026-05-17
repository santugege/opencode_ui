import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError } from "../app/errors";
import type { AuthService } from "../services/auth.service";
import type { OpencodeGateway } from "../services/opencode.service";
import { requireCurrentUser } from "./guards";

/**
 * opencode question tool 路由需要的依赖。
 */
export interface QuestionsRoutesOptions {
  /** 用于解析当前用户的认证服务。 */
  auth: AuthService;
  /** 负责读取和回复 opencode question 请求。 */
  opencode: OpencodeGateway;
}

interface QuestionParams {
  /** opencode question request ID。 */
  requestId: string;
}

interface ReplyQuestionBody {
  /** 按 question 顺序传入的答案数组。 */
  answers?: unknown;
}

/**
 * 注册 opencode question tool 的浏览器交互路由。
 */
export const questionsRoutes: FastifyPluginAsync<QuestionsRoutesOptions> = async (app, options) => {
  app.get("/questions", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    const questions = await options.opencode.listQuestions({
      workspacePath: current.user.workspacePath,
    });

    return { questions };
  });

  app.post<{ Body: ReplyQuestionBody; Params: QuestionParams }>("/questions/:requestId/reply", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    const requestId = requireNonEmptyParam(request.params.requestId, "requestId");
    const answers = parseAnswers(request.body);

    await options.opencode.replyQuestion({
      answers,
      requestId,
      workspacePath: current.user.workspacePath,
    });

    return { accepted: true };
  });

  app.post<{ Params: QuestionParams }>("/questions/:requestId/reject", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    const requestId = requireNonEmptyParam(request.params.requestId, "requestId");

    await options.opencode.rejectQuestion({
      requestId,
      workspacePath: current.user.workspacePath,
    });

    return { accepted: true };
  });
};

function parseAnswers(body: ReplyQuestionBody | undefined) {
  const value = requireObject(body, "Request body must be a JSON object.");
  const answers = value.answers;
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new ApiHttpError(400, "answers must be a non-empty array.");
  }

  return answers.map((answer, index) => {
    if (!Array.isArray(answer) || answer.length === 0) {
      throw new ApiHttpError(400, `answers[${index}] must be a non-empty string array.`);
    }
    const values = answer.map((item, itemIndex) => {
      if (typeof item !== "string" || !item.trim()) {
        throw new ApiHttpError(400, `answers[${index}][${itemIndex}] must be a non-empty string.`);
      }
      return item.trim();
    });
    return Array.from(new Set(values));
  });
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiHttpError(400, message);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyParam(value: string | undefined, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiHttpError(400, `${field} must be a non-empty string.`);
  }
  return value.trim();
}
