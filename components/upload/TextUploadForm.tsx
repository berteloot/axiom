"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface TextUploadFormProps {
  onUpload: (text: string, title: string) => void;
  disabled?: boolean;
}

export function TextUploadForm({ onUpload, disabled }: TextUploadFormProps) {
  const [textContent, setTextContent] = useState("");
  const [textTitle, setTextTitle] = useState("");

  const handleSubmit = () => {
    if (!textContent.trim() || !textTitle.trim()) return;
    onUpload(textContent, textTitle);
    setTextContent("");
    setTextTitle("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="text-title">Asset Title</Label>
        <Input
          id="text-title"
          placeholder="Enter a title for this text asset"
          value={textTitle}
          onChange={(e) => setTextTitle(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="text-content">Text Content</Label>
        <Textarea
          id="text-content"
          placeholder="Paste or type your text content here..."
          value={textContent}
          onChange={(e) => setTextContent(e.target.value)}
          disabled={disabled}
          rows={10}
          className="font-mono text-sm"
        />
      </div>
      <Button
        onClick={handleSubmit}
        disabled={disabled || !textContent.trim() || !textTitle.trim()}
        className="w-full"
      >
        {disabled ? "Uploading..." : "Upload Text Asset"}
      </Button>
    </div>
  );
}
