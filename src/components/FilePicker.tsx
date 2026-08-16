/**
 * Shared file picker with drag-and-drop and (for multi) reorder/remove (F-8).
 * Validates through the caller's `onValidate` so PDF tools keep P1-11 checks.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  accept: string;
  label: string;
  onValidate?: (file: File) => Promise<void>;
  onReject?: (error: unknown) => void;
};

export function FilePicker({
  multiple = false,
  files,
  onChange,
  accept,
  label,
  onValidate,
  onReject,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const ingest = async (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.length === 0) {
      if (!multiple) onChange([]);
      return;
    }

    const accepted: File[] = [];
    for (const file of incoming) {
      try {
        if (onValidate) await onValidate(file);
        accepted.push(file);
      } catch (error) {
        onReject?.(error);
      }
    }

    if (multiple) {
      onChange([...files, ...accepted]);
    } else {
      onChange(accepted.slice(0, 1));
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) {
      if (!multiple) onChange([]);
      return;
    }
    await ingest(list);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) await ingest(e.dataTransfer.files);
  };

  const move = (index: number, delta: number) => {
    const next = [...files];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Label htmlFor="file-picker">{label}</Label>
      <div
        className={cn(
          "mt-1 rounded-md border border-dashed border-input p-4 transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p className="text-sm text-muted-foreground mb-2">
          Drag and drop here, or choose files.
        </p>
        <Input
          id="file-picker"
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-2">
          {multiple ? (
            <>
              <p className="text-sm text-muted-foreground">
                {files.length} files — processed in this order:
              </p>
              <ol className="list-decimal list-inside mt-1 space-y-1">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-2 flex-wrap">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => move(index, -1)} aria-label={`Move ${file.name} up`}>
                      Up
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => move(index, 1)} aria-label={`Move ${file.name} down`}>
                      Down
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeAt(index)} aria-label={`Remove ${file.name}`}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Selected file: {files[0]?.name}</p>
          )}
        </div>
      )}
    </div>
  );
}
