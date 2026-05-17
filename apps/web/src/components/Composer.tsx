import { ChevronDown, Paperclip, RotateCcw, SendHorizontal, SlidersHorizontal } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { FileCard } from "./FileCard";
import type { FileAttachmentView, ModelCatalogView, ModelSelectionView } from "../types";

interface ComposerProps {
  files: FileAttachmentView[];
  isLoadingModels?: boolean;
  isStreaming?: boolean;
  modelCatalog?: ModelCatalogView;
  modelLoadError?: string;
  modelSelection?: ModelSelectionView;
  onAttachFiles?: (files: File[]) => void;
  onModelSelectionChange?: (model: ModelSelectionView) => void;
  onSendMessage?: (text: string) => boolean | Promise<boolean | void> | void;
}

const emptyModelSelection: ModelSelectionView = {
  modelID: "",
  providerID: "",
};

export function Composer({
  files,
  isLoadingModels = false,
  isStreaming = false,
  modelCatalog,
  modelLoadError,
  modelSelection = emptyModelSelection,
  onAttachFiles,
  onModelSelectionChange,
  onSendMessage,
}: ComposerProps) {
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isSubmitting || isStreaming;
  const providers = modelCatalog?.providers ?? [];
  const selectedProvider = providers.find((provider) => provider.id === modelSelection.providerID);
  const selectedModel = selectedProvider?.models.find((model) => model.modelID === modelSelection.modelID);
  const selectedModelLabel = selectedModel
    ? `${selectedProvider?.name ?? selectedModel.providerID} / ${selectedModel.name}`
    : "自动选择";
  const canSelectModels = Boolean(onModelSelectionChange) && !isLoadingModels && !modelLoadError && providers.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get("message") ?? "");
    setIsSubmitting(true);
    try {
      const shouldReset = await onSendMessage?.(text);
      if (shouldReset !== false) form.reset();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    onAttachFiles?.(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function clearModelSelection() {
    onModelSelectionChange?.(emptyModelSelection);
  }

  function handleProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    const providerID = event.target.value;
    if (!providerID) {
      clearModelSelection();
      return;
    }

    const provider = providers.find((candidate) => candidate.id === providerID);
    const defaultModel = provider?.models.find((model) => model.modelID === provider.defaultModelID);
    const modelID = defaultModel?.modelID ?? provider?.models[0]?.modelID ?? "";
    onModelSelectionChange?.({ providerID, modelID });
  }

  function handleModelChange(event: ChangeEvent<HTMLSelectElement>) {
    const modelID = event.target.value;
    if (!modelID || !selectedProvider) {
      clearModelSelection();
      return;
    }

    onModelSelectionChange?.({ providerID: selectedProvider.id, modelID });
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {files.length > 0 ? (
        <div className="composer__files" aria-label="已附加文件">
          {files.map((file) => (
            <FileCard file={file} key={file.id} />
          ))}
        </div>
      ) : null}

      {isModelPanelOpen ? (
        <div className="composer__model-panel" id="composer-model-panel">
          <div className="composer__model-panel-header">
            <div className="composer__model-summary">
              <span>当前模型</span>
              <strong>{selectedModelLabel}</strong>
            </div>
            <button
              className="composer__model-auto"
              disabled={isBusy || !onModelSelectionChange || !hasModelSelection(modelSelection)}
              onClick={clearModelSelection}
              type="button"
            >
              <RotateCcw size={15} strokeWidth={2} />
              自动
            </button>
          </div>
          <div className="composer__model-fields">
            <label className="composer__model-field">
              <span>服务商</span>
              <span className="composer__select-wrap">
                <select
                  disabled={isBusy || !canSelectModels}
                  onChange={handleProviderChange}
                  value={modelSelection.providerID}
                >
                  <option value="">自动选择</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" size={16} strokeWidth={2} />
              </span>
            </label>
            <label className="composer__model-field">
              <span>模型</span>
              <span className="composer__select-wrap">
                <select
                  disabled={isBusy || !canSelectModels || !selectedProvider}
                  onChange={handleModelChange}
                  value={selectedProvider ? modelSelection.modelID : ""}
                >
                  <option value="">自动选择</option>
                  {selectedProvider?.models.map((model) => (
                    <option key={model.id} value={model.modelID}>
                      {model.name}{model.isDefault ? " / 默认" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" size={16} strokeWidth={2} />
              </span>
            </label>
          </div>
          {isLoadingModels ? <p className="composer__model-state">正在加载模型列表...</p> : null}
          {!isLoadingModels && modelLoadError ? (
            <p className="composer__model-state composer__model-state--error">{modelLoadError}</p>
          ) : null}
          {!isLoadingModels && !modelLoadError && providers.length === 0 ? (
            <p className="composer__model-state">当前 opencode 工作区没有可选模型。</p>
          ) : null}
        </div>
      ) : null}

      <div className="composer__input-row">
        <label aria-disabled={isBusy} className="icon-button composer__attach">
          <Paperclip size={18} strokeWidth={1.9} />
          <input aria-label="附加文件" disabled={isBusy} name="files" onChange={handleFiles} type="file" />
        </label>
        <textarea disabled={isBusy} name="message" placeholder="发送消息给 opencode..." rows={1} />
        <button
          aria-controls="composer-model-panel"
          aria-expanded={isModelPanelOpen}
          aria-label="模型设置"
          className="icon-button"
          onClick={() => setIsModelPanelOpen((current) => !current)}
          type="button"
        >
          <SlidersHorizontal size={18} strokeWidth={1.9} />
        </button>
        <button aria-label="发送消息" className="send-button" disabled={isBusy} type="submit">
          <SendHorizontal size={18} strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}

function hasModelSelection(model: ModelSelectionView) {
  return Boolean(model.providerID.trim() && model.modelID.trim());
}
