import type { FastifyPluginAsync } from "fastify";
import type { AuthService } from "../services/auth.service";
import type { OpencodeGateway } from "../services/opencode.service";
import type { OpencodeModelCatalogData, OpencodeModelData, OpencodeProviderData } from "../types/opencode";
import { requireCurrentUser } from "./guards";

/**
 * 模型列表路由需要的依赖。
 */
export interface ModelsRoutesOptions {
  /** 用于解析当前用户的认证服务。 */
  auth: AuthService;
  /** 负责从 opencode 读取当前工作区可用模型。 */
  opencode: OpencodeGateway;
}

interface ModelListItem {
  id: string;
  object: "model";
  providerID: string;
  providerName: string;
  modelID: string;
  name: string;
  isDefault: boolean;
  contextWindow?: number;
  outputLimit?: number;
  supportsAttachments?: boolean;
  supportsReasoning?: boolean;
  supportsTools?: boolean;
}

interface ModelProviderItem {
  id: string;
  name: string;
  defaultModelID?: string;
  models: ModelListItem[];
}

/**
 * 注册 OpenAI 风格的模型列表接口，供前端选择 opencode provider/model。
 */
export const modelsRoutes: FastifyPluginAsync<ModelsRoutesOptions> = async (app, options) => {
  app.get("/v1/models", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    const catalog = await options.opencode.listModels({ workspacePath: current.user.workspacePath });
    return toModelListResponse(catalog);
  });
};

function toModelListResponse(catalog: OpencodeModelCatalogData) {
  const defaultModelIDs = catalog.default ?? {};
  const providers = catalog.providers
    .map((provider) => toProviderItem(provider, defaultModelIDs))
    .filter((provider) => provider.models.length > 0);
  const data = providers.flatMap((provider) => provider.models);

  return {
    object: "list" as const,
    data,
    providers,
    default: defaultModelIDs,
  };
}

function toProviderItem(provider: OpencodeProviderData, defaultModelIDs: Record<string, string>): ModelProviderItem {
  const providerName = provider.name?.trim() || provider.id;
  const defaultModelID = defaultModelIDs[provider.id];
  const models = Object.entries(provider.models).map(([modelID, model]) =>
    toModelItem({
      defaultModelID,
      model,
      modelID,
      providerID: provider.id,
      providerName,
    }),
  );

  return {
    id: provider.id,
    name: providerName,
    defaultModelID,
    models,
  };
}

function toModelItem(input: {
  defaultModelID?: string;
  model: OpencodeModelData;
  modelID: string;
  providerID: string;
  providerName: string;
}): ModelListItem {
  return {
    id: `${input.providerID}/${input.modelID}`,
    object: "model",
    providerID: input.providerID,
    providerName: input.providerName,
    modelID: input.modelID,
    name: input.model.name?.trim() || input.model.id?.trim() || input.modelID,
    isDefault: input.defaultModelID === input.modelID,
    contextWindow: finiteNumber(input.model.limit?.context),
    outputLimit: finiteNumber(input.model.limit?.output),
    supportsAttachments: input.model.attachment,
    supportsReasoning: input.model.reasoning,
    supportsTools: input.model.tool_call,
  };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
