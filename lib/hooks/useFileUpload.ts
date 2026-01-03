import { useState, useCallback } from "react";

interface UploadProgress {
  status: "idle" | "uploading" | "processing" | "success" | "error";
  message?: string;
}

export function useFileUpload(onSuccess?: () => void) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ status: "idle" });

  const uploadFile = useCallback(async (file: File) => {
    try {
      setUploadProgress({ status: "uploading", message: "Requesting upload URL..." });

      // 1) Ask API for presigned URL
      const presignedRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type || "application/octet-stream" }),
      });

      if (!presignedRes.ok) {
        const text = await presignedRes.text().catch(() => "");
        throw new Error(`Presigned URL error: ${presignedRes.status} ${presignedRes.statusText} ${text}`.trim());
      }

      const { url, key } = (await presignedRes.json()) as { url: string; key: string };

      setUploadProgress({ status: "uploading", message: "Uploading to S3..." });

      // 2) Upload directly to S3 using PUT
      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) {
        const text = await putRes.text().catch(() => "");
        throw new Error(`S3 upload error: ${putRes.status} ${putRes.statusText} ${text}`.trim());
      }

      setUploadProgress({ status: "processing", message: "Processing asset..." });

      // 3) Trigger processing
      const processRes = await fetch("/api/assets/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          title: file.name,
          fileType: file.type || "application/octet-stream",
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
