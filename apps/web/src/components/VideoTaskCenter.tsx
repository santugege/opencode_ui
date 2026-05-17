import { AlertCircle, ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCcw, Search, Trash2, Video, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ApiClient, ApiVideoTask, ApiVideoTaskListFilters, VideoTaskStatus } from "../api";

interface VideoTaskCenterProps {
  api: ApiClient;
}

type StatusFilter = VideoTaskStatus | "";

interface AppliedFilters {
  model: string;
  serviceTier: string;
  status: StatusFilter;
  taskIds: string[];
}

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部状态", value: "" },
  { label: "queued", value: "queued" },
  { label: "running", value: "running" },
  { label: "cancelled", value: "cancelled" },
  { label: "succeeded", value: "succeeded" },
  { label: "failed", value: "failed" },
  { label: "expired", value: "expired" },
];

const pageSizeOptions = [10, 20, 50, 100];

const emptyFilters: AppliedFilters = {
  model: "",
  serviceTier: "",
  status: "",
  taskIds: [],
};

const statusLabel = {
  cancelled: "已取消",
  expired: "已过期",
  failed: "失败",
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
} satisfies Record<VideoTaskStatus, string>;

export function VideoTaskCenter({ api }: VideoTaskCenterProps) {
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(emptyFilters);
  const [draftModel, setDraftModel] = useState("");
  const [draftServiceTier, setDraftServiceTier] = useState("");
  const [draftTaskIds, setDraftTaskIds] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [detailError, setDetailError] = useState<string | undefined>();
  const [isActingTaskId, setIsActingTaskId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedTask, setSelectedTask] = useState<ApiVideoTask | undefined>();
  const [tasks, setTasks] = useState<ApiVideoTask[]>([]);
  const [total, setTotal] = useState(0);

  const filters = useMemo<ApiVideoTaskListFilters>(
    () => ({
      model: appliedFilters.model || undefined,
      pageNum,
      pageSize,
      serviceTier: appliedFilters.serviceTier || undefined,
      status: appliedFilters.status || undefined,
      taskIds: appliedFilters.taskIds,
    }),
    [appliedFilters, pageNum, pageSize],
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!api.listVideoTasks) {
      setError("当前 API 客户端未配置视频任务列表接口。");
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(undefined);
    api
      .listVideoTasks(filters)
      .then((result) => {
        if (!isMounted) return;
        setTasks(result.items);
        setTotal(result.total);
        setSelectedTask((current) => {
          if (!current) return undefined;
          return result.items.find((task) => task.id === current.id) ?? undefined;
        });
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : "无法加载视频任务。");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [api, filters, refreshVersion]);

  function applyTextFilters() {
    setError(undefined);
    setAppliedFilters((current) => ({
      ...current,
      model: draftModel.trim(),
      serviceTier: draftServiceTier.trim(),
      taskIds: parseTaskIds(draftTaskIds),
    }));
    setPageNum(1);
  }

  function clearFilters() {
    setDraftModel("");
    setDraftServiceTier("");
    setDraftTaskIds("");
    setAppliedFilters(emptyFilters);
    setPageNum(1);
  }

  function changeStatus(status: StatusFilter) {
    setAppliedFilters((current) => ({ ...current, status }));
    setPageNum(1);
  }

  async function selectTask(task: ApiVideoTask) {
    setSelectedTask(task);
    setDetailError(undefined);
    if (!api.getVideoTask) {
      setDetailError("当前 API 客户端未配置视频任务详情接口。");
      return;
    }

    setIsLoadingDetail(true);
    try {
      setSelectedTask(await api.getVideoTask(task.id));
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "无法加载视频任务详情。");
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function deleteTask(task: ApiVideoTask) {
    if (!api.deleteVideoTask) {
      setDetailError("当前 API 客户端未配置视频任务删除接口。");
      return;
    }

    const action = task.status === "queued" ? "取消排队" : "删除记录";
    if (!window.confirm(`确认${action}视频任务 ${task.id}？`)) return;

    setIsActingTaskId(task.id);
    setDetailError(undefined);
    try {
      await api.deleteVideoTask(task.id);
      setSelectedTask(undefined);
      setRefreshVersion((version) => version + 1);
    } catch (deleteError) {
      setDetailError(deleteError instanceof Error ? deleteError.message : `${action}失败。`);
    } finally {
      setIsActingTaskId(undefined);
    }
  }

  return (
    <section className="video-tasks" aria-label="视频任务">
      <header className="video-tasks__header">
        <div>
          <p className="eyebrow">Ark 视频生成</p>
          <h2>视频任务</h2>
        </div>
        <button className="video-tasks__ghost-button" onClick={() => setRefreshVersion((version) => version + 1)} type="button">
          <RefreshCcw size={15} strokeWidth={2} />
          刷新
        </button>
      </header>

      <div className="video-tasks__body">
        <div className="video-tasks__main">
          <div className="video-tasks__filters" aria-label="视频任务筛选">
            <label>
              <span>状态</span>
              <select value={appliedFilters.status} onChange={(event) => changeStatus(event.target.value as StatusFilter)}>
                {statusOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>任务 ID</span>
              <input
                onChange={(event) => setDraftTaskIds(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyTextFilters();
                }}
                placeholder="支持逗号、空格或换行分隔"
                type="search"
                value={draftTaskIds}
              />
            </label>
            <label>
              <span>模型</span>
              <input
                onChange={(event) => setDraftModel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyTextFilters();
                }}
                placeholder="按模型精确筛选"
                value={draftModel}
              />
            </label>
            <label>
              <span>Service tier</span>
              <input
                onChange={(event) => setDraftServiceTier(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyTextFilters();
                }}
                placeholder="default 或 flex"
                value={draftServiceTier}
              />
            </label>
            <div className="video-tasks__filter-actions">
              <button className="video-tasks__primary-button" onClick={applyTextFilters} type="button">
                <Search size={14} strokeWidth={2} />
                查询
              </button>
              <button className="video-tasks__ghost-button" onClick={clearFilters} type="button">
                <XCircle size={14} strokeWidth={2} />
                清除
              </button>
            </div>
          </div>

          {error ? (
            <div className="video-tasks__alert" role="alert">
              <AlertCircle size={17} strokeWidth={1.9} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="video-tasks__summary" aria-live="polite">
            <span>{isLoading ? "正在加载任务..." : `共 ${total} 个任务`}</span>
            <label>
              <span>每页</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPageNum(1);
                }}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <TaskTable
            isLoading={isLoading}
            onDeleteTask={deleteTask}
            onSelectTask={selectTask}
            selectedTaskId={selectedTask?.id}
            tasks={tasks}
            actingTaskId={isActingTaskId}
          />

          <TaskCards
            actingTaskId={isActingTaskId}
            isLoading={isLoading}
            onDeleteTask={deleteTask}
            onSelectTask={selectTask}
            selectedTaskId={selectedTask?.id}
            tasks={tasks}
          />

          <div className="video-tasks__pagination">
            <button
              className="video-tasks__ghost-button"
              disabled={pageNum <= 1 || isLoading}
              onClick={() => setPageNum((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft size={15} strokeWidth={2} />
              上一页
            </button>
            <span>
              第 {pageNum} / {totalPages} 页
            </span>
            <button
              className="video-tasks__ghost-button"
              disabled={pageNum >= totalPages || isLoading}
              onClick={() => setPageNum((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              下一页
              <ChevronRight size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        <TaskDetail
          detailError={detailError}
          isActing={Boolean(selectedTask && selectedTask.id === isActingTaskId)}
          isLoading={isLoadingDetail}
          onDeleteTask={deleteTask}
          task={selectedTask}
        />
      </div>
    </section>
  );
}

function TaskTable({
  actingTaskId,
  isLoading,
  onDeleteTask,
  onSelectTask,
  selectedTaskId,
  tasks,
}: {
  actingTaskId?: string;
  isLoading: boolean;
  onDeleteTask: (task: ApiVideoTask) => void;
  onSelectTask: (task: ApiVideoTask) => void;
  selectedTaskId?: string;
  tasks: ApiVideoTask[];
}) {
  return (
    <div className="video-tasks__table-wrap">
      <table className="video-tasks__table">
        <thead>
          <tr>
            <th>任务 ID</th>
            <th>模型</th>
            <th>状态</th>
            <th>规格</th>
            <th>创建时间</th>
            <th>更新时间</th>
            <th>结果</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr className={selectedTaskId === task.id ? "is-selected" : undefined} key={task.id}>
              <td>
                <button className="video-tasks__link-button" onClick={() => onSelectTask(task)} type="button">
                  {task.id}
                </button>
              </td>
              <td>{textValue(task.model)}</td>
              <td>
                <StatusBadge status={task.status} />
              </td>
              <td>{taskSpecLabel(task)}</td>
              <td>{formatArkTime(task.created_at)}</td>
              <td>{formatArkTime(task.updated_at)}</td>
              <td>
                <ResultLink task={task} />
              </td>
              <td>
                <TaskActionButton actingTaskId={actingTaskId} onDeleteTask={onDeleteTask} task={task} />
              </td>
            </tr>
          ))}
          {!isLoading && tasks.length === 0 ? (
            <tr>
              <td className="video-tasks__empty-cell" colSpan={8}>
                没有匹配的视频任务
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function TaskCards({
  actingTaskId,
  isLoading,
  onDeleteTask,
  onSelectTask,
  selectedTaskId,
  tasks,
}: {
  actingTaskId?: string;
  isLoading: boolean;
  onDeleteTask: (task: ApiVideoTask) => void;
  onSelectTask: (task: ApiVideoTask) => void;
  selectedTaskId?: string;
  tasks: ApiVideoTask[];
}) {
  if (!isLoading && tasks.length === 0) {
    return (
      <div className="video-tasks__cards">
        <div className="video-tasks__card-empty">没有匹配的视频任务</div>
      </div>
    );
  }

  return (
    <div className="video-tasks__cards">
      {tasks.map((task) => (
        <article className={`video-task-card${selectedTaskId === task.id ? " is-selected" : ""}`} key={task.id}>
          <button className="video-task-card__main" onClick={() => onSelectTask(task)} type="button">
            <span>
              <strong>{task.id}</strong>
              <small>{textValue(task.model)}</small>
            </span>
            <StatusBadge status={task.status} />
          </button>
          <dl>
            <div>
              <dt>规格</dt>
              <dd>{taskSpecLabel(task)}</dd>
            </div>
            <div>
              <dt>创建</dt>
              <dd>{formatArkTime(task.created_at)}</dd>
            </div>
            <div>
              <dt>更新</dt>
              <dd>{formatArkTime(task.updated_at)}</dd>
            </div>
          </dl>
          <div className="video-task-card__actions">
            <ResultLink task={task} />
            <TaskActionButton actingTaskId={actingTaskId} onDeleteTask={onDeleteTask} task={task} />
          </div>
        </article>
      ))}
    </div>
  );
}

function TaskDetail({
  detailError,
  isActing,
  isLoading,
  onDeleteTask,
  task,
}: {
  detailError?: string;
  isActing: boolean;
  isLoading: boolean;
  onDeleteTask: (task: ApiVideoTask) => void;
  task?: ApiVideoTask;
}) {
  const videoUrl = task ? videoUrlFromTask(task) : undefined;
  const lastFrameUrl = task ? lastFrameUrlFromTask(task) : undefined;

  return (
    <aside className="video-tasks__detail" aria-label="视频任务详情">
      {task ? (
        <>
          <header className="video-tasks__detail-header">
            <div>
              <p className="eyebrow">任务详情</p>
              <h3>{task.id}</h3>
            </div>
            <StatusBadge status={task.status} />
          </header>

          {detailError ? (
            <div className="video-tasks__alert" role="alert">
              <AlertCircle size={17} strokeWidth={1.9} />
              <span>{detailError}</span>
            </div>
          ) : null}

          {isLoading ? (
            <div className="video-tasks__detail-loading">
              <Loader2 size={17} strokeWidth={2} />
              正在读取详情
            </div>
          ) : null}

          <div className="video-tasks__preview">
            {videoUrl ? (
              <video controls preload="none" src={videoUrl}>
                当前浏览器无法播放该视频。
              </video>
            ) : (
              <div className="video-tasks__preview-empty">
                <Video size={24} strokeWidth={1.8} />
                <span>暂无视频结果</span>
              </div>
            )}
          </div>

          <dl className="video-tasks__detail-list">
            <DetailItem href={videoUrl} label="video_url" value={videoUrl} isUrl />
            <DetailItem href={lastFrameUrl} label="last_frame_url" value={lastFrameUrl} isUrl />
            <DetailItem label="模型" value={task.model} />
            <DetailItem label="Service tier" value={stringFromTask(task, "service_tier")} />
            <DetailItem label="Seed" value={displayValue(task.seed)} />
            <DetailItem label="分辨率" value={displayValue(valueFromTask(task, "resolution"))} />
            <DetailItem label="比例" value={displayValue(valueFromTask(task, "ratio"))} />
            <DetailItem label="时长" value={displayValue(valueFromTask(task, "duration"))} />
            <DetailItem label="帧数" value={displayValue(valueFromTask(task, "frames"))} />
          </dl>

          <JsonSection title="错误信息" value={task.error} />
          <JsonSection title="Usage" value={task.usage} />
          <JsonSection title="音频信息" value={valueFromTask(task, "audio") ?? valueFromTask(task, "generate_audio")} />
          <JsonSection title="Draft 信息" value={valueFromTask(task, "draft")} />

          <TaskActionButton actingTaskId={isActing ? task.id : undefined} fullWidth onDeleteTask={onDeleteTask} task={task} />
        </>
      ) : (
        <div className="video-tasks__detail-empty">
          <Video size={28} strokeWidth={1.7} />
          <h3>选择任务查看详情</h3>
          <p>详情会显示错误、结果链接、usage、seed 和音频/draft 信息。</p>
        </div>
      )}
    </aside>
  );
}

function StatusBadge({ status }: { status: VideoTaskStatus }) {
  return <span className={`video-status video-status--${status}`}>{statusLabel[status]}</span>;
}

function TaskActionButton({
  actingTaskId,
  fullWidth = false,
  onDeleteTask,
  task,
}: {
  actingTaskId?: string;
  fullWidth?: boolean;
  onDeleteTask: (task: ApiVideoTask) => void;
  task: ApiVideoTask;
}) {
  if (!canDeleteTask(task.status)) return <span className="video-tasks__muted">不可操作</span>;
  const label = task.status === "queued" ? "取消排队" : "删除记录";
  return (
    <button
      className={`video-tasks__danger-button${fullWidth ? " video-tasks__danger-button--full" : ""}`}
      disabled={actingTaskId === task.id}
      onClick={() => onDeleteTask(task)}
      type="button"
    >
      <Trash2 size={14} strokeWidth={2} />
      {actingTaskId === task.id ? "处理中" : label}
    </button>
  );
}

function ResultLink({ task }: { task: ApiVideoTask }) {
  const url = videoUrlFromTask(task);
  if (!url) return <span className="video-tasks__muted">暂无</span>;
  return (
    <a className="video-tasks__result-link" href={url} rel="noreferrer" target="_blank">
      打开
      <ExternalLink size={13} strokeWidth={2} />
    </a>
  );
}

function DetailItem({ href, isUrl = false, label, value }: { href?: string; isUrl?: boolean; label: string; value?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {isUrl && value && href ? (
          <a href={href} rel="noreferrer" target="_blank">
            {value}
          </a>
        ) : (
          value ?? "-"
        )}
      </dd>
    </div>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <section className="video-tasks__json-section">
      <h4>{title}</h4>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function canDeleteTask(status: VideoTaskStatus) {
  return status === "queued" || status === "succeeded" || status === "failed" || status === "expired";
}

function parseTaskIds(value: string) {
  return Array.from(new Set(value.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean)));
}

function taskSpecLabel(task: ApiVideoTask) {
  const resolution = displayValue(valueFromTask(task, "resolution"));
  const ratio = displayValue(valueFromTask(task, "ratio"));
  const duration = displayValue(valueFromTask(task, "duration"));
  const frames = displayValue(valueFromTask(task, "frames"));
  return [resolution, ratio, [duration, frames].filter((part) => part !== "-").join(" / ")]
    .filter((part) => part && part !== "-")
    .join(" · ") || "-";
}

function videoUrlFromTask(task: ApiVideoTask) {
  return stringFromTask(task, "video_url");
}

function lastFrameUrlFromTask(task: ApiVideoTask) {
  return stringFromTask(task, "last_frame_url");
}

function stringFromTask(task: ApiVideoTask, field: string) {
  const value = valueFromTask(task, field);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function valueFromTask(task: ApiVideoTask, field: string) {
  if (task[field] !== undefined) return task[field];
  const content = objectRecord(task.content);
  return content ? content[field] : undefined;
}

function objectRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function textValue(value: unknown) {
  return displayValue(value);
}

function formatArkTime(value: unknown) {
  const milliseconds = arkTimeToMilliseconds(value);
  return milliseconds === undefined ? "-" : new Date(milliseconds).toLocaleString();
}

function arkTimeToMilliseconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return arkTimeToMilliseconds(numeric);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
