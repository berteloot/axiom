"use client";

import { useDropzone } from "react-dropzone";
import { FileText, Image, FileSpreadsheet, Video } from "lucide-react";

// Accepted file types matching lib/validations.ts
const ACCEPTED_FILE_TYPES = {
  // Documents
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  // Video (Audio-First analysis - transcribes speech)
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/x-msvideo": [".avi"],
  "video/webm": [".webm"],
  "video/mpeg": [".mpeg", ".mpg"],
  "video/x-m4v": [".m4v"],
  // Audio
  "audio/mpeg": [".mp3"],
  "audio/mp4": [".m4a"],
  "audio/wav": [".wav"],
  "audio/ogg": [".ogg"],
  "audio/flac": [".flac"],
};

interface FileDropzoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
}

export function FileDropzone({ onDrop, disabled }: FileDropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled,
    accept: ACCEPTED_FILE_TYPES,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-colors duration-200
        ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-4">
        <svg
          className="w-12 h-12 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        {isDragActive ? (
          <p className="text-lg font-medium">Drop the file here...</p>
        ) : (
          <>
            <p className="text-lg font-medium">
              Drag & drop a file here, or click to select
            </p>
            <p className="text-sm text-muted-foreground">
              Upload marketing assets for AI analysis
            </p>
          </>
        )}
        
        {/* Supported file types */}
        <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            <span>PDF, DOC, DOCX, TXT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Image className="w-4 h-4" />
            <span>JPG, PNG, GIF, WebP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            <span>XLS, XLSX, CSV</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Video className="w-4 h-4" />
            <span>MP4, MOV, MP3, M4A</span>
          </div>
        </div>
        
        {/* Hints */}
        <div className="text-xs text-muted-foreground/70 mt-1 space-y-0.5">
          <p>💡 Images (infographics, charts, slides) are analyzed using GPT-4o vision</p>
          <p>🎬 Videos &amp; audio are transcribed and analyzed (max 25MB)</p>
        </div>
      </div>
    </div>
  );
}
