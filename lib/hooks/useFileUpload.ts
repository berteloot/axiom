import { useState, useCallback } from "react";

interface UploadProgress {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  message?: string;
}

// Threshold for using presigned URL direct upload (50MB or all videos)
const PRESIGNED_THRESHOLD = 50 * 1024 * 1024; // 50MB

export function useFileUpload(onSuccess?: () => void) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ status: "idle" });

  const uploadFile = useCallback(async (file: File) => {
    try {
      setUploadProgress({ status: "uploading", message: "Uploading file..." });

      const fileSize = file.size;
      const isVideo = file.type.startsWith("video/");
      const usePresigned = isVideo || fileSize > PRESIGNED_THRESHOLD;

      let key: string;
      let fileName: string;
      let fileType: string;

      if (usePresigned) {
        // For large files/videos: Use presigned URL for direct S3 upload
        // This bypasses the Next.js server, preventing timeouts and memory issues
        console.log(`Using presigned URL for ${isVideo ? "video" : "large"} file: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

        // 1) Get presigned URL from backend
        const presignedRes = await fetch("/api/upload/presigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
          }),
        });

        if (!presignedRes.ok) {
          const text = await presignedRes.text().catch(() => "");
          const errorData = await presignedRes.json().catch(() => ({ error: text }));
          throw new Error(
            `Presigned URL error: ${presignedRes.status} ${presignedRes.statusText} - ${errorData.error || text}`.trim()
          );
        }

        const { url: presignedUrl, key: presignedKey } = (await presignedRes.json()) as {
          url: string;
          key: string;
        };

        key = presignedKey;
        fileName = file.name;
        fileType = file.type || "application/octet-stream";

        // 2) Upload directly to S3 using presigned URL
        const s3UploadRes = await fetch(presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": fileType,
          },
        });

        if (!s3UploadRes.ok) {
          const text = await s3UploadRes.text().catch(() => "");
          throw new Error(
            `S3 upload error: ${s3UploadRes.status} ${s3UploadRes.statusText} - ${text}`.trim()
          );
        }
      } else {
        // For smaller files: Upload through backend API (simpler, avoids CORS)
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const text = await uploadRes.text().catch(() => "");
          const errorData = await uploadRes.json().catch(() => ({ error: text }));
          throw new Error(
            `Upload error: ${uploadRes.status} ${uploadRes.statusText} - ${errorData.error || text}`.trim()
          );
        }

        const result = (await uploadRes.json()) as {
          key: string;
          fileName: string;
          fileType: string;
        };

        key = result.key;
        fileName = result.fileName;
        fileType = result.fileType;
      }

      setUploadProgress({ status: "processing", message: "Processing asset..." });

      // 2) Trigger processing
      const processRes = await fetch("/api/assets/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          title: fileName,
          fileType: fileType || file.type || "application/octet-stream",
        }),
      });

      if (!processRes.ok) {
        const text = await processRes.text().catch(() => "");
        throw new Error(`Process error: ${processRes.status} ${processRes.statusText} ${text}`.trim());
      }

      const result = await processRes.json();

      setUploadProgress({
        status: "success",
        message: `Uploaded. Asset ID: ${result.asset?.id ?? "unknown"}`,
      });

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => setUploadProgress({ status: "idle" }), 2500);
    } catch (err) {
      console.error(err);
      setUploadProgress({
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, [onSuccess]);

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
