"use client";

interface UploadProgress {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  message?: string;
  currentFile?: number;
  totalFiles?: number;
  currentFileName?: string;
}

interface UploadStatusProps {
  progress: UploadProgress;
}

export function UploadStatus({ progress }: UploadStatusProps) {
  if (progress.status === "idle") return null;

  return (
    <div className="mt-4">
      <div
        className={`
          p-4 rounded-lg
          ${
            progress.status === "error"
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : progress.status === "success"
              ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
              : "bg-muted border border-border"
          }
        `}
      >
        <div className="flex items-center gap-3">
          {progress.status === "uploading" || progress.status === "processing" ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          ) : progress.status === "success" ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : progress.status === "error" ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : null}
          <div className="flex-1">
            <p className="text-sm font-medium">
              {progress.message || "Processing..."}
            </p>
            {progress.totalFiles && progress.totalFiles > 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                File {progress.currentFile || 0} of {progress.totalFiles}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
