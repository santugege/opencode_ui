import { Paperclip, SendHorizontal, SlidersHorizontal } from "lucide-react";
import { FileCard } from "./FileCard";
import type { FileAttachmentView } from "../types";
import type { ChangeEvent, FormEvent } from "react";

interface ComposerProps {
  files: FileAttachmentView[];
  onAttachFiles?: (files: File[]) => void;
  onSendMessage?: (text: string) => void;
}

export function Composer({ files, onAttachFiles, onSendMessage }: ComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get("message") ?? "");
    onSendMessage?.(text);
    form.reset();
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    onAttachFiles?.(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {files.length > 0 ? (
        <div className="composer__files" aria-label="Attached files">
          {files.map((file) => (
            <FileCard file={file} key={file.id} />
          ))}
        </div>
      ) : null}

      <div className="composer__input-row">
        <label className="icon-button composer__attach">
          <Paperclip size={18} strokeWidth={1.9} />
          <input aria-label="Attach files" name="files" onChange={handleFiles} type="file" />
        </label>
        <textarea name="message" placeholder="Message opencode..." rows={1} />
        <button aria-label="Session controls" className="icon-button" type="button">
          <SlidersHorizontal size={18} strokeWidth={1.9} />
        </button>
        <button aria-label="Send message" className="send-button" type="submit">
          <SendHorizontal size={18} strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
