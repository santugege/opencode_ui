import { Check, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { QuestionAnswerView, QuestionRequestView, QuestionSubmissionStatus } from "../types";

interface QuestionRequestCardProps {
  onReject?: (requestId: string) => Promise<void> | void;
  onReply?: (requestId: string, answers: QuestionAnswerView[]) => Promise<void> | void;
  request: QuestionRequestView;
}

type SelectionState = Record<number, string[]>;
type CustomAnswerState = Record<number, string>;

export function QuestionRequestCard({ onReject, onReply, request }: QuestionRequestCardProps) {
  const [customAnswers, setCustomAnswers] = useState<CustomAnswerState>({});
  const [selections, setSelections] = useState<SelectionState>({});
  const isBusy = Boolean(request.submissionStatus);
  const answers = useMemo(
    () =>
      request.questions.map((question, index) => {
        const selected = selections[index] ?? [];
        const customAnswer = customAnswers[index]?.trim();
        if (!question.custom || !customAnswer) return selected;
        return question.multiple ? [...selected, customAnswer] : [customAnswer];
      }),
    [customAnswers, request.questions, selections],
  );
  const canSubmit = Boolean(onReply) && !isBusy && answers.every((answer) => answer.length > 0);

  function handleOptionToggle(questionIndex: number, label: string, multiple: boolean | undefined) {
    setSelections((current) => {
      const selected = current[questionIndex] ?? [];
      const next = multiple
        ? selected.includes(label)
          ? selected.filter((candidate) => candidate !== label)
          : [...selected, label]
        : [label];
      return { ...current, [questionIndex]: next };
    });
  }

  function handleCustomAnswerChange(questionIndex: number, value: string) {
    setCustomAnswers((current) => ({ ...current, [questionIndex]: value }));
  }

  function handleReply() {
    if (!canSubmit) return;
    void onReply?.(request.id, answers);
  }

  function handleReject() {
    if (!onReject || isBusy) return;
    void onReject(request.id);
  }

  return (
    <article className="question-card" aria-label="opencode 请求选择">
      <div className="question-card__header">
        <span>需要你选择</span>
        {request.tool ? <code>{request.tool.callID}</code> : null}
      </div>
      <div className="question-card__body">
        {request.questions.map((question, questionIndex) => {
          const selected = selections[questionIndex] ?? [];
          return (
            <section className="question-card__question" key={`${request.id}-${questionIndex}`}>
              <h3>{question.header}</h3>
              <p>{question.question}</p>
              {question.options.length > 0 ? (
                <div className="question-card__options" role="group" aria-label={question.header}>
                  {question.options.map((option) => {
                    const isSelected = selected.includes(option.label);
                    return (
                      <button
                        aria-pressed={isSelected}
                        className="question-card__option"
                        disabled={isBusy}
                        key={option.label}
                        onClick={() => handleOptionToggle(questionIndex, option.label, question.multiple)}
                        type="button"
                      >
                        <span className="question-card__option-mark" aria-hidden="true">
                          {isSelected ? <Check size={14} strokeWidth={2.3} /> : null}
                        </span>
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {question.custom ? (
                <label className="question-card__custom">
                  <span>自定义答案</span>
                  <input
                    disabled={isBusy}
                    onChange={(event) => handleCustomAnswerChange(questionIndex, event.target.value)}
                    value={customAnswers[questionIndex] ?? ""}
                  />
                </label>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="question-card__actions">
        <button
          className="question-card__secondary"
          disabled={!onReject || isBusy}
          onClick={handleReject}
          type="button"
        >
          {request.submissionStatus === "rejecting" ? (
            <Loader2 className="question-card__spinner" size={14} strokeWidth={2.2} />
          ) : (
            <X size={14} strokeWidth={2.2} />
          )}
          {statusLabel(request.submissionStatus, "rejecting", "拒绝回答")}
        </button>
        <button className="question-card__primary" disabled={!canSubmit} onClick={handleReply} type="button">
          {request.submissionStatus === "replying" ? (
            <Loader2 className="question-card__spinner" size={14} strokeWidth={2.2} />
          ) : (
            <Check size={14} strokeWidth={2.2} />
          )}
          {statusLabel(request.submissionStatus, "replying", "提交选择")}
        </button>
      </div>
    </article>
  );
}

function statusLabel(
  current: QuestionSubmissionStatus | undefined,
  expected: QuestionSubmissionStatus,
  idleLabel: string,
) {
  if (!current) return idleLabel;
  return current === expected ? (expected === "replying" ? "提交中" : "拒绝中") : idleLabel;
}
