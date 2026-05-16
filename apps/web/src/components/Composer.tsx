import { Paperclip, SendHorizontal, SlidersHorizontal } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { FileCard } from "./FileCard";
import type { FileAttachmentView } from "../types";

interface ComposerProps {
  files: FileAttachmentView[];
  onAttachFiles?: (files: File[]) => void;
  onSendMessage?: (text: string) => boolean | Promise<boolean | void> | void;
}

export function Composer({ files, onAttachFiles, onSendMessage }: ComposerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

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

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {files.length > 0 ? (
        <div className="composer__files" aria-label="已附加文件">
          {files.map((file) => (
            <FileCard file={file} key={file.id} />
          ))}
        </div>
      ) : null}

      <div className="composer__input-row">
        <label className="icon-button composer__attach">
          <Paperclip size={18} strokeWidth={1.9} />
          <input aria-label="附加文件" name="files" onChange={handleFiles} type="file" />
        </label>
        <textarea name="message" placeholder="发送消息给 opencode..." rows={1} />
        <button aria-label="会话控制" className="icon-button" type="button">
          <SlidersHorizontal size={18} strokeWidth={1.9} />
        </button>
        <button aria-label="发送消息" className="send-button" disabled={isSubmitting} type="submit">
          <SendHorizontal size={18} strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
