"use client";
import { cn } from "@/lib/utils";
import React, { useRef, useState } from "react";
import { IconUpload } from "@tabler/icons-react";
import { X } from "lucide-react";
import { useDropzone } from "react-dropzone";


export const FileUpload = ({
  onChange,
}: {
  onChange?: (files: File[]) => void;
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prevFiles) => {
      const next = [...prevFiles, ...newFiles];
      onChange?.(next);
      return next;
    });
  };

  const clearFiles = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onChange?.([]);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop: handleFileChange,
    onDropRejected: () => {},
  });

  return (
    <div className="w-full" {...getRootProps()}>
      <div
        onClick={handleClick}
        className={cn(
          "group/file flex w-full cursor-pointer items-stretch gap-3 overflow-hidden rounded-lg border border-cyan-500/30 bg-black p-3 min-h-0",
          "shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
        )}
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
          className="hidden"
          aria-label="Upload file"
        />
        {/* Left: file info or placeholder */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1">
          {files.length > 0 ? (
            files.map((file, idx) => (
              <div
                key={"file" + idx}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate text-xs font-medium text-white">
                    {file.name}
                  </p>
                  <span className="shrink-0 rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                  <button
                    type="button"
                    onClick={clearFiles}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    title="Remove file"
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="rounded bg-slate-800/80 px-1 py-0.5 text-slate-300">{file.type}</span>
                  <span>modified {new Date(file.lastModified).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          ) : (
            <>
              <p className="text-xs font-medium text-white">Upload file</p>
              <p className="text-[10px] text-slate-400">Drag & drop or click</p>
            </>
          )}
        </div>
        {/* Right: dropzone target */}
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-cyan-500/40 bg-slate-900/80 w-16 h-14 group-hover/file:shadow-[0_0_12px_rgba(34,211,238,0.12)]",
            "shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
          )}
        >
          {isDragActive ? (
            <span className="flex flex-col items-center text-[10px] text-cyan-400">
              Drop
              <IconUpload className="h-4 w-4 text-cyan-400 mt-0.5" />
            </span>
          ) : (
            <IconUpload className="h-5 w-5 text-cyan-400/80" />
          )}
        </div>
      </div>
    </div>
  );
};

export function GridPattern() {
  const columns = 41;
  const rows = 11;
  return (
    <div className="flex shrink-0 scale-105 flex-wrap items-center justify-center gap-x-px gap-y-px bg-black">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          return (
            <div
              key={`${col}-${row}`}
              className={`flex h-10 w-10 shrink-0 rounded-[2px] ${
                index % 2 === 0
                  ? "bg-slate-900/80"
                  : "bg-slate-800/80"
              }`}
            />
          );
        }),
      )}
    </div>
  );
}
