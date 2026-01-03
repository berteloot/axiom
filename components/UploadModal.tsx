"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUploader } from "@/components/FileUploader";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

export function UploadModal({ open, onOpenChange, onUploadSuccess }: UploadModalProps) {
  const handleUploadSuccess = () => {
    if (onUploadSuccess) {
      onUploadSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upload New Asset</DialogTitle>
          <DialogDescription>
            Upload a marketing asset to analyze and categorize
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <FileUploader onUploadSuccess={handleUploadSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
