/**
 * 进程内 JSON 请求辅助方法的入参，用于测试或不需要绑定 TCP 端口的本地调用。
 */
export interface JsonFetchOptions {
  /** 可 JSON 序列化的请求体。 */
  body?: unknown;
  /** 以请求头名称为键的 HTTP 请求头。 */
  headers?: Record<string, string>;
  /** HTTP 方法，未传入时默认使用 GET。 */
  method?: string;
}

/**
 * 进程内请求辅助方法返回的标准 JSON 响应结构。
 */
export interface JsonResponse {
  /** 响应存在内容时解析后的响应体。 */
  body: unknown;
  /** 面向现有调用方的 Web 标准响应头对象。 */
  headers: Headers;
  /** Fastify 路由返回的 HTTP 状态码。 */
  status: number;
}
