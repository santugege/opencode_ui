import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import App, { WorkspaceApp } from "./App";
import type { ApiClient, ApiSession, ApiSessionDetail } from "./api";
import type { WorkspaceViewModel } from "./types";

const styles = readFileSync("src/styles.css", "utf8");

const viewModel: WorkspaceViewModel = {
  user: {
    email: "person@example.com",
  },
  sessions: [
    {
      id: "session-1",
      title: "图片提取",
      status: "thinking",
      updatedAtLabel: "2 分钟前",
    },
    {
      id: "session-2",
      title: "季度简报",
      status: "ready",
      updatedAtLabel: "昨天",
    },
  ],
  activeSessionId: "session-1",
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "从这个演示文稿中提取待办事项。",
      createdAtLabel: "10:30",
      files: [
        {
          id: "file-1",
          name: "launch-plan.pdf",
          kind: "document",
          sizeLabel: "1.8 MB",
          status: "ready",
        },
      ],
    },
    {
      id: "message-2",
      role: "assistant",
      content: "我发现了三个发布风险，以及一个缺少负责人的 QA 签核项。",
      createdAtLabel: "10:31",
      files: [],
    },
  ],
  composerFiles: [
    {
      id: "file-2",
      name: "interview-notes.docx",
      kind: "document",
      sizeLabel: "84 KB",
      status: "uploading",
      progress: 62,
    },
    {
      id: "file-3",
      name: "screenshot.png",
      kind: "image",
      sizeLabel: "422 KB",
      status: "ready",
    },
  ],
  error: "会话正在重新连接，opencode 已暂停。",
};

describe("WorkspaceApp", () => {
  it("renders the default workspace shell in Chinese", () => {
    render(<WorkspaceApp />);

    expect(screen.getByRole("button", { name: "新建会话" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "文档审阅" })).toBeInTheDocument();
    expect(screen.getByText("对比这些笔记，并告诉我评审前需要跟进的事项。")).toBeInTheDocument();
    expect(screen.getByText("interview-notes.docx")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("发送消息给 opencode...")).toBeInTheDocument();
  });

  it("uses the light reference background instead of the old black theme", () => {
    expect(styles).toContain("background: #ffffff;");
    expect(styles).toContain("linear-gradient(180deg, #eef5fb 0%, #f8faf4 55%, #fff7d7 100%)");
    expect(styles).not.toMatch(/background:\s*#(?:0f0f0d|11100e|151411|0d0d0b)\b/i);
  });

  it("renders the empty session state", () => {
    render(
      <WorkspaceApp
        model={{
          user: { email: "person@example.com" },
          sessions: [
            {
              id: "session-empty",
              title: "未命名会话",
              status: "ready",
              updatedAtLabel: "刚刚",
            },
          ],
          activeSessionId: "session-empty",
          messages: [],
          composerFiles: [],
        }}
      />,
    );

    expect(screen.getAllByText("未命名会话")).toHaveLength(3);
    expect(screen.getByText("输入问题、附加文件，opencode 会在这个独立会话中工作。")).toBeInTheDocument();
  });

  it("renders session history, status, chat messages, and inline files", () => {
    render(<WorkspaceApp model={viewModel} />);

    expect(screen.getByRole("complementary", { name: "会话历史" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建会话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "图片提取 思考中 2 分钟前" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("季度简报")).toBeInTheDocument();
    expect(screen.getByText("思考中")).toBeInTheDocument();

    expect(screen.getByText("从这个演示文稿中提取待办事项。")).toBeInTheDocument();
    expect(screen.getByText("我发现了三个发布风险，以及一个缺少负责人的 QA 签核项。")).toBeInTheDocument();
    expect(screen.getByText("launch-plan.pdf")).toBeInTheDocument();
    expect(screen.getByText("1.8 MB")).toBeInTheDocument();
  });

  it("renders composer attachments, upload progress, and retryable errors", () => {
    const onRetry = vi.fn();
    render(<WorkspaceApp model={viewModel} onRetry={onRetry} />);

    expect(screen.getByLabelText("附加文件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeInTheDocument();
    expect(screen.getByText("interview-notes.docx")).toBeInTheDocument();
    expect(screen.getByText("上传中 62%")).toBeInTheDocument();
    expect(screen.getByText("screenshot.png")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "screenshot.png 就绪" })).toBeInTheDocument();
    expect(screen.getByText("会话正在重新连接，opencode 已暂停。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试 opencode 请求" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("App integration shell", () => {
  it("registers a new user and enters an empty workspace", async () => {
    const api = createFakeApi();
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "AI 工作区" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    await screen.findByRole("button", { name: "新建会话" });

    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText("输入问题、附加文件，opencode 会在这个独立会话中工作。")).toBeInTheDocument();
  });

  it("creates a session, uploads a file, sends a message, and revisits session history", async () => {
    const api = createFakeApi();
    render(<App api={api} />);

    fireEvent.change(await screen.findByLabelText("邮箱"), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));
    await screen.findByRole("button", { name: "新建会话" });

    fireEvent.click(screen.getByRole("button", { name: "新建会话" }));
    expect(await screen.findByRole("button", { name: "未命名会话 就绪 刚刚" })).toHaveAttribute("aria-current", "page");

    const file = new File(["Quarterly numbers"], "quarterly.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("附加文件"), {
      target: { files: [file] },
    });

    await screen.findByText("quarterly.csv");

    fireEvent.change(screen.getByPlaceholderText("发送消息给 opencode..."), {
      target: { value: "Summarize this spreadsheet." },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(within(screen.getByRole("list")).getByText("Summarize this spreadsheet.")).toBeInTheDocument();
    });
    expect(screen.getByRole("article", { name: "quarterly.csv 就绪" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Summarize this spreadsheet. 就绪 刚刚" }));

    await waitFor(() => {
      expect(within(screen.getByRole("list")).getByText("Summarize this spreadsheet.")).toBeInTheDocument();
    });
  });

  it("signs out and returns to the auth screen", async () => {
    const api = createFakeApi();
    render(<App api={api} />);

    fireEvent.change(await screen.findByLabelText("邮箱"), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));
    await screen.findByRole("button", { name: "新建会话" });

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(await screen.findByRole("button", { name: "创建账号" })).toBeInTheDocument();
    expect(screen.queryByText("person@example.com")).not.toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledOnce();
  });
});

function createFakeApi(): ApiClient {
  let user: { email: string } | null = null;
  let sessions: ApiSessionDetail[] = [];
  let sequence = 0;
  const logout = vi.fn(async () => {
    user = null;
    sessions = [];
  });

  return {
    async createSession(input) {
      sequence += 1;
      const session: ApiSessionDetail = {
        id: `session-${sequence}`,
        title: input.title,
        status: "ready",
        updatedAt: new Date().toISOString(),
        files: [],
        messages: [],
      };
      sessions = [session, ...sessions];
      return toSessionSummary(session);
    },

    async getSession(sessionId) {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (!session) throw new Error("Session not found");
      return session;
    },

    async listSessions() {
      return sessions.map(toSessionSummary);
    },

    async login(input) {
      user = { email: input.email };
      return { user };
    },

    logout,

    async me() {
      return user ? { user } : null;
    },

    async register(input) {
      user = { email: input.email };
      return { user };
    },

    async sendMessage(sessionId, input) {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (!session) throw new Error("Session not found");
      const files = session.files.filter((file) => input.fileIds.includes(file.id));
      const message = {
        id: `message-${sequence}`,
        role: "user" as const,
        content: input.text,
        createdAt: new Date().toISOString(),
        files,
        sessionId,
      };
      session.messages = [...session.messages, message];
      session.title = input.text;
      return { message, session };
    },

    async uploadFile(sessionId, file) {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (!session) throw new Error("Session not found");
      const uploaded = {
        id: `file-${sequence}`,
        name: file.name,
        kind: "spreadsheet" as const,
        mimeType: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
      session.files = [...session.files, uploaded];
      return uploaded;
    },
  };
}

function toSessionSummary(session: ApiSessionDetail): ApiSession {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    updatedAt: session.updatedAt,
    files: session.files,
  };
}
