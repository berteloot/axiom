import { useState, useCallback, useEffect } from "react";
import { useAccount } from "@/lib/account-context";

interface UploadProgress {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  message?: string;
  currentFile?: number;
  totalFiles?: number;
  currentFileName?: string;
}

// MIME type mapping for common file extensions
const MIME_TYPES: Record<string, string> = {
  // Video
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  flv: "video/x-flv",
  "3gp": "video/3gpp",
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

// Helper: Read error body for fetch responses, prefer JSON error if available
async function readErrorBody(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  if (!raw) return "";

  try {
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === "object" && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore JSON parse errors
  }

  return raw;
}

// Helper: Infer MIME type from file extension
function inferMimeType(fileName: string, browserType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  
  // Trust browser type if it's set and not generic
  if (browserType && browserType !== "application/octet-stream") {
    return browserType;
  }
  
  // Look up MIME type from extension
  return MIME_TYPES[ext] || browserType || "application/octet-stream";
}

export function useFileUpload(onSuccess?: () => void) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ status: "idle" });
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const { currentAccount } = useAccount();

  // Process a single file upload
  const processSingleFile = useCallback(async (file: File, fileIndex: number, totalFiles: number) => {
    try {
      // Validate file size before starting upload
      const fileSizeMB = file.size / (1024 * 1024);
      const maxFileSizeMB = currentAccount?.maxFileSize || 100; // Default to 100MB
      
      if (fileSizeMB > maxFileSizeMB) {
        throw new Error(
          `File "${file.name}" size (${fileSizeMB.toFixed(2)}MB) exceeds the maximum allowed size of ${maxFileSizeMB}MB. Please compress the file or contact your administrator.`
        );
      }

      setUploadProgress({ 
        status: "uploading", 
        message: `Uploading ${file.name}...`,
        currentFile: fileIndex + 1,
        totalFiles,
        currentFileName: file.name
      });

      const fileSize = file.size;
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
      
      // Infer the correct MIME type
      const fileType = inferMimeType(file.name, file.type);
      
      // Debug logging
      console.log("Upload started (DIRECT S3):", {
        fileName: file.name,
        browserType: file.type,
        inferredType: fileType,
        fileExtension,
        fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
      });

      // ============================================================
      // RADICALLY SIMPLE: ALL uploads go directly to S3 via presigned URL
      // This completely bypasses the backend for file data transfer
      // No FormData, no proxy, no server memory issues, no timeouts
      // ============================================================

      // Step 1: Get presigned URL from backend (small JSON request, fast)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for URL generation
      
      let presignedRes: Response;
      try {
        presignedRes = await fetch("/api/upload/presigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileType: fileType,
            fileSize: file.size, // Include file size for server-side validation
          }),
          signal: controller.signal,
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error("Request to generate upload URL timed out. Please try again.");
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!presignedRes.ok) {
        const errText = await readErrorBody(presignedRes);
        throw new Error(
          `Failed to prepare upload: ${presignedRes.status} ${presignedRes.statusText}${errText ? ` - ${errText}` : ""}`.trim()
        );
      }

      const { url: presignedUrl, key } = (await presignedRes.json()) as {
        url: string;
        key: string;
      };

      console.log("Got presigned URL, uploading directly to S3...");

      // Step 2: Upload directly to S3 (browser → S3, no server in between)
      // Use a generous timeout based on file size (minimum 5 min, scale with size)
      const uploadTimeoutMs = Math.max(5 * 60 * 1000, (fileSize / (1024 * 1024)) * 60 * 1000); // ~1 min per MB, min 5 min
      const uploadController = new AbortController();
      const uploadTimeoutId = setTimeout(() => uploadController.abort(), uploadTimeoutMs);
      
      let s3UploadRes: Response;
      try {
        s3UploadRes = await fetch(presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": fileType,
          },
          signal: uploadController.signal,
        });
      } catch (uploadError) {
        clearTimeout(uploadTimeoutId);
        if (uploadError instanceof Error && uploadError.name === "AbortError") {
          throw new Error("Upload timed out. Please check your connection and try again.");
        }
        // Log detailed error for debugging
        console.error("S3 upload failed:", uploadError);
        throw new Error("Upload failed. Please check your connection and try again.");
      } finally {
        clearTimeout(uploadTimeoutId);
      }

      if (!s3UploadRes.ok) {
        const text = await s3UploadRes.text().catch(() => "");
        console.error("S3 upload response error:", s3UploadRes.status, text);
        throw new Error(
          `Upload failed: ${s3UploadRes.status} ${s3UploadRes.statusText}`.trim()
        );
      }

      console.log("S3 upload complete, processing asset...");

      setUploadProgress({ status: "processing", message: "Processing asset..." });

      // Step 3: Trigger asset processing (small JSON request, fast)
      const processRes = await fetch("/api/assets/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          title: file.name,
          fileType: fileType,
        }),
      });

      if (!processRes.ok) {
        const errText = await readErrorBody(processRes);
        throw new Error(
          `Processing failed: ${processRes.status} ${processRes.statusText}${errText ? ` - ${errText}` : ""}`.trim()
        );
      }

      const result = await processRes.json();

      setUploadProgress({
        status: "success",
        message: `Uploaded ${file.name}. Asset ID: ${result.asset?.id ?? "unknown"}`,
        currentFile: fileIndex + 1,
        totalFiles,
        currentFileName: file.name
      });

      return { success: true };
    } catch (err) {
      console.error("Upload error:", err);
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setUploadProgress({
        status: "error",
        message: `Failed to upload ${file.name}: ${errorMessage}`,
        currentFile: fileIndex + 1,
        totalFiles,
        currentFileName: file.name
      });
      return { success: false, error: errorMessage };
    }
  }, [currentAccount]);

  // Process the file queue sequentially
  useEffect(() => {
    const processQueue = async () => {
      if (isProcessingQueue || fileQueue.length === 0) return;
      
      setIsProcessingQueue(true);
      const filesToProcess = [...fileQueue]; // Copy queue before processing
      const totalFiles = filesToProcess.length;
      
      // Clear queue immediately to prevent duplicate processing
      setFileQueue([]);
      
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        await processSingleFile(file, i, totalFiles);
        
        // Small delay between files to avoid overwhelming the server
        if (i < filesToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Reset processing state
      setIsProcessingQueue(false);
      
      // Show final success message
      setUploadProgress({
        status: "success",
        message: `Successfully uploaded ${totalFiles} file${totalFiles > 1 ? 's' : ''}`,
      });
      
      if (onSuccess) {
        onSuccess();
      }
      
      setTimeout(() => setUploadProgress({ status: "idle" }), 3000);
    };
    
    if (fileQueue.length > 0 && !isProcessingQueue) {
      processQueue();
    }
  }, [fileQueue, isProcessingQueue, processSingleFile, onSuccess]);

  // Main upload function - adds file to queue
  const uploadFile = useCallback((file: File) => {
    setFileQueue(prev => [...prev, file]);
  }, []);

  const uploadText = useCallback(async (textContent: string, textTitle: string) => {
    if (!textContent.trim()) {
      alert("Please enter some text content");
      return;
    }

    if (!textTitle.trim()) {
      alert("Please enter a title for the text asset");
      return;
    }

    try {
      setUploadProgress({ status: "uploading", message: "Creating text file..." });

      // Create a Blob from the text content
      const blob = new Blob([textContent], { type: "text/plain" });
      const file = new File([blob], `${textTitle}.txt`, { type: "text/plain" });

      // Use the same upload flow as file upload
      await uploadFile(file);

      // Reset progress will be handled by uploadFile
    } catch (err) {
      console.error(err);
      setUploadProgress({
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, [uploadFile]);

  return {
    uploadProgress,
    uploadFile,
    uploadText,
  };
}
