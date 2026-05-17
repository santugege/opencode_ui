import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError } from "../app/errors";
import type { AuthService } from "../services/auth.service";
import type { VideoTaskListInput, VideoTaskService, VideoTaskStatus } from "../services/videoTask.service";
import { requireCurrentUser } from "./guards";

export interface VideoTasksRoutesOptions {
  /** 用于解析当前用户的认证服务。 */
  auth: AuthService;
  /** 代理火山 Ark 视频生成任务接口的服务。 */
  videoTasks: VideoTaskService;
}

interface VideoTaskParams {
  /** Ark 视频生成任务 ID。 */
  taskId: string;
}

const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * 注册视频生成任务查询和管理路由。前端只访问本服务，Ark API Key 不离开服务端。
 */
export const videoTasksRoutes: FastifyPluginAsync<VideoTasksRoutesOptions> = async (app, options) => {
  app.get("/video-tasks", async (request) => {
    requireCurrentUser(options.auth, request);
    return await options.videoTasks.listTasks(parseListQuery(request.query));
  });

  app.get<{ Params: VideoTaskParams }>("/video-tasks/:taskId", async (request) => {
    requireCurrentUser(options.auth, request);
    const taskId = requireTaskId(request.params.taskId);
    return {
      task: await options.videoTasks.getTask(taskId),
    };
  });

  app.delete<{ Params: VideoTaskParams }>("/video-tasks/:taskId", async (request) => {
    requireCurrentUser(options.auth, request);
    const taskId = requireTaskId(request.params.taskId);
    await options.videoTasks.deleteTask(taskId);
    return { deleted: true, id: taskId };
  });
};

function parseListQuery(query: unknown): VideoTaskListInput {
  const record = objectRecord(query);
  return {
    model: optionalText(record.model, "model"),
    pageNum: positiveInteger(record.page_num, "page_num", DEFAULT_PAGE_NUM),
    pageSize: boundedPageSize(record.page_size),
    serviceTier: optionalText(record.service_tier, "service_tier"),
    status: optionalStatus(record.status),
    taskIds: parseTaskIds(record.task_ids),
  };
}

function requireTaskId(value: string | undefined) {
  const taskId = value?.trim();
  if (!taskId) throw new ApiHttpError(400, "Task id is required.");
  return taskId;
}

function objectRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function positiveInteger(value: unknown, field: string, defaultValue: number) {
  if (value === undefined) return defaultValue;
  const source = Array.isArray(value) ? value[0] : value;
  const parsed = typeof source === "string" ? Number(source) : source;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1) {
    throw new ApiHttpError(400, `${field} must be a positive integer.`);
  }
  return parsed;
}

function boundedPageSize(value: unknown) {
  const pageSize = positiveInteger(value, "page_size", DEFAULT_PAGE_SIZE);
  if (pageSize > MAX_PAGE_SIZE) {
    throw new ApiHttpError(400, `page_size must be less than or equal to ${MAX_PAGE_SIZE}.`);
  }
  return pageSize;
}

function optionalText(value: unknown, field: string) {
  if (value === undefined) return undefined;
  const source = Array.isArray(value) ? value[0] : value;
  if (typeof source !== "string") throw new ApiHttpError(400, `${field} must be a string.`);
  const trimmed = source.trim();
  return trimmed || undefined;
}

function parseTaskIds(value: unknown) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item !== "string") throw new ApiHttpError(400, "task_ids must be a string or string array.");
    return item
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  });
}

function optionalStatus(value: unknown) {
  if (value === undefined) return undefined;
  const source = Array.isArray(value) ? value[0] : value;
  if (typeof source !== "string") throw new ApiHttpError(400, "status must be a string.");
  if (!source.trim()) return undefined;
  if (!isVideoTaskStatus(source)) throw new ApiHttpError(400, "Unsupported video task status.");
  return source;
}

function isVideoTaskStatus(value: string): value is VideoTaskStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "cancelled" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "expired"
  );
}
