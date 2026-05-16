import type { FastifyPluginAsync } from "fastify";

/**
 * 注册进程健康检查端点。
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ healthy: true }));
};
