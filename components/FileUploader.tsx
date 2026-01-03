"use client";

import { useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFileUpload } from "@/lib/hooks/useFileUpload";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { TextUploadForm } from "@/components/upload/TextUploadForm";
import { UploadStatus } from "@/components/upload/UploadStatus";
import { useAccount } from "@/lib/account-context";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { Building2, AlertCircle } from "lucide-react";

interface FileUploaderProps {
  onUploadSuccess?: () => void;
}

export function FileUploader({ onUploadSuccess }: FileUploaderProps) {
  const { currentAccount, isLoading: accountLoading } = useAccount();
  const { uploadProgress, uploadFile, uploadText } = useFileUpload(onUploadSuccess);

  const handleDrop = useCallback((files: File[]) => {
    if (!currentAccount) return;
    const file = files[0];
    if (file) {
      uploadFile(file);
    }
  }, [uploadFile, currentAccount]);

  const handleTextUpload = useCallback((text: string, title: string) => {
    if (!currentAccount) return;
    uploadText(text, title);
  }, [uploadText, currentAccount]);

  const isUploading = uploadProgress.status === "uploading" || uploadProgress.status === "processing";

  // Show account selection if no account is selected
  if (accountLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading accounts...</p>
        </div>
      </div>
    );
  }

  if (!currentAccount) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="border-2 border-dashed border-yellow-500/50 rounded-lg p-8 bg-yellow-500/5">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">Account Required</h3>
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              Please select an account before uploading assets. All assets will be associated with the selected account.
            </p>
            <div className="w-full max-w-xs mt-2">
              <AccountSwitcher />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="mb-6 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>Uploading to: <span className="font-medium text-foreground">{currentAccount.name}</span></span>
          </div>
          <AccountSwitcher />
        </div>
      </div>

      <Tabs defaultValue="file" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="file">Upload File</TabsTrigger>
          <TabsTrigger value="text">Paste Text</TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="space-y-4">
          <FileDropzone onDrop={handleDrop} disabled={isUploading} />
        </TabsContent>

        <TabsContent value="text" className="space-y-4">
          <TextUploadForm onUpload={handleTextUpload} disabled={isUploading} />
        </TabsContent>
      </Tabs>

      <UploadStatus progress={uploadProgress} />
    </div>
  );
}
