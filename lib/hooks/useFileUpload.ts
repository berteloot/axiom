import { useState, useCallback } from "react";

interface UploadProgress {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  message?: string;
}

export function useFileUpload(onSuccess?: () => void) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ status: "idle" });

  const uploadFile = useCallback(async (file: File) => {
    try {
      setUploadProgress({ status: "uploading", message: "Uploading file..." });

      // 1) Upload file through backend API (avoids CORS issues)
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

      const { key, fileName, fileType } = (await uploadRes.json()) as {
        key: string;
        fileName: string;
        fileType: string;
      };

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
