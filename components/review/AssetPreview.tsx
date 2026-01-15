"use client";

import { useState, useEffect, useRef } from "react";
import { Asset, TranscriptSegment } from "@/lib/types";
import { Image, Sparkles, Video, Music, FileText, Pencil, Check, X } from "lucide-react";
import { VideoDeepSearch } from "@/components/VideoDeepSearch";
import { VideoCompressionGuide } from "@/components/VideoCompressionGuide";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface AssetPreviewProps {
  asset: Asset;
  onExtractedTextChange?: (text: string) => void;
  extractedTextValue?: string;
}

// Editable extracted text component
function EditableExtractedText({ 
  text, 
  onChange, 
  editable 
}: { 
  text: string; 
  onChange?: (text: string) => void;
  editable: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(text);

  const handleSave = () => {
    if (onChange) {
      onChange(editedText);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedText(text);
    setIsEditing(false);
  };

  // Update local state when prop changes
  useEffect(() => {
    setEditedText(text);
  }, [text]);

  return (
    <div className="border rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-sm">Extracted Text</h3>
        </div>
        {editable && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-7 px-2 text-xs"
          >
            <Pencil className="w-3 h-3 mr-1" />
            Edit
          </Button>
        )}
        {isEditing && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
            >
              <Check className="w-3 h-3 mr-1" />
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </div>
        )}
      </div>
      {isEditing ? (
        <Textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="text-sm min-h-[200px] font-mono"
          placeholder="Enter extracted text..."
        />
      ) : (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
          {text || "No extracted text available"}
        </p>
      )}
      {editable && (
        <p className="text-xs text-muted-foreground mt-2">
          {isEditing 
            ? "Edit the text to remove unnecessary content. Click Save when done."
            : "Click Edit to modify the extracted text."}
        </p>
      )}
    </div>
  );
}

export function AssetPreview({ asset, onExtractedTextChange, extractedTextValue }: AssetPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const [showCompressionGuide, setShowCompressionGuide] = useState(false);
  const [compressionGuideFileSize, setCompressionGuideFileSize] = useState<number | null>(null);
  const [chunkingProgress, setChunkingProgress] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (asset.s3Url) {
      loadPreview();
    }

    // Load transcript segments for video assets
    if (asset.fileType.startsWith("video/")) {
      loadTranscriptSegments();
      checkJobStatus(); // Check if there's an active job
    }

    // Cleanup polling on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [asset.s3Url, asset.id]);

  const checkJobStatus = async () => {
    try {
      const response = await fetch(`/api/assets/${asset.id}/transcript-status`);
      if (response.ok) {
        const data = await response.json();
        const job = data.job;

        if (job && (job.status === "PENDING" || job.status === "PROCESSING")) {
          // There's an active job, start polling
          setGeneratingTranscript(true);
          const progressText = job.progress 
            ? `🔄 Processing... ${job.progress}%`
            : "🔄 Processing in background...";
          setChunkingProgress(progressText);

          // Clear any existing polling
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }

          // Start polling
          pollIntervalRef.current = setInterval(async () => {
            try {
              const statusResponse = await fetch(`/api/assets/${asset.id}/transcript-status`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                const currentJob = statusData.job;

                if (currentJob) {
                  if (currentJob.status === "COMPLETED") {
                    if (pollIntervalRef.current) {
                      clearInterval(pollIntervalRef.current);
                      pollIntervalRef.current = null;
                    }
                    setChunkingProgress(`✅ Processing completed! ${statusData.segmentsCount} segments created.`);
                    await loadTranscriptSegments();
                    setTimeout(() => {
                      setChunkingProgress(null);
                      setGeneratingTranscript(false);
                    }, 3000);
                  } else if (currentJob.status === "FAILED") {
                    if (pollIntervalRef.current) {
                      clearInterval(pollIntervalRef.current);
                      pollIntervalRef.current = null;
                    }
                    
                    const errorMessage = currentJob.error || "Unknown error";
                    setChunkingProgress(`❌ Processing failed: ${errorMessage}`);
                    setGeneratingTranscript(false);
                    
                    // Show compression guide if it's a size error
                    const fileSizeMatch = errorMessage.match(/(\d+)MB/);
                    const detectedFileSize = fileSizeMatch ? parseInt(fileSizeMatch[1]) : null;
                    
                    if (errorMessage.includes("too large") || errorMessage.includes("File too large") || errorMessage.includes("Unable to process large video")) {
                      setShowCompressionGuide(true);
                      setCompressionGuideFileSize(detectedFileSize || 465);
                    }
                  } else if (currentJob.status === "PROCESSING") {
                    const progressText = currentJob.progress 
                      ? `🔄 Processing... ${currentJob.progress}%`
                      : "🔄 Processing in background...";
                    setChunkingProgress(progressText);
                  }
                }
              }
            } catch (pollError) {
              console.error("Error polling job status:", pollError);
            }
          }, 2000);

          // Safety timeout
          setTimeout(() => {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setGeneratingTranscript(false);
          }, 10 * 60 * 1000);
        }
      }
    } catch (error) {
      console.error("Error checking job status:", error);
    }
  };

  const loadTranscriptSegments = async () => {
    try {
      setSegmentsLoading(true);
      const response = await fetch(`/api/assets/${asset.id}/transcript`);
      if (response.ok) {
        const data = await response.json();
        setTranscriptSegments(data.segments || []);
      } else {
        console.error("Failed to load transcript segments");
        setTranscriptSegments([]);
      }
    } catch (error) {
      console.error("Error loading transcript segments:", error);
      setTranscriptSegments([]);
    } finally {
      setSegmentsLoading(false);
    }
  };

  const handleGenerateTranscript = async () => {
    try {
      setGeneratingTranscript(true);
      setShowCompressionGuide(false);
      setCompressionGuideFileSize(null);
      setChunkingProgress("🔄 Starting background processing...");

      // Start the job (returns immediately)
      const response = await fetch(`/api/assets/${asset.id}/generate-transcript`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.showCompressionGuide) {
          setShowCompressionGuide(true);
          setCompressionGuideFileSize(errorData.fileSize || null);
        }
        setChunkingProgress("Failed to start processing");
        setGeneratingTranscript(false);
        return;
      }

      const data = await response.json();
      const jobId = data.jobId;

      // Clear any existing polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      // Poll for job status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/assets/${asset.id}/transcript-status`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const job = statusData.job;

              if (job) {
                if (job.status === "COMPLETED") {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  setChunkingProgress(`✅ Processing completed! ${statusData.segmentsCount} segments created.`);
                  await loadTranscriptSegments();
                  setTimeout(() => {
                    setChunkingProgress(null);
                    setGeneratingTranscript(false);
                  }, 3000);
                } else if (job.status === "FAILED") {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  
                  const errorMessage = job.error || "Unknown error";
                  setChunkingProgress(`❌ Processing failed: ${errorMessage}`);
                  setGeneratingTranscript(false);
                  
                  // Show compression guide if it's a size error
                  const fileSizeMatch = errorMessage.match(/(\d+)MB/);
                  const detectedFileSize = fileSizeMatch ? parseInt(fileSizeMatch[1]) : null;
                  
                  if (errorMessage.includes("too large") || errorMessage.includes("File too large") || errorMessage.includes("Unable to process large video")) {
                    setShowCompressionGuide(true);
                    setCompressionGuideFileSize(detectedFileSize || 465); // Use detected size or default
                  }
                } else if (job.status === "PROCESSING") {
                  // Update progress message
                  const progressText = job.progress 
                    ? `🔄 Processing... ${job.progress}%`
                    : "🔄 Processing in background...";
                  setChunkingProgress(progressText);
                }
              }
            }
          } catch (pollError) {
            console.error("Error polling job status:", pollError);
          }
        }, 2000); // Poll every 2 seconds

      // Clear interval after 10 minutes (safety timeout)
      setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setChunkingProgress("⏱️ Processing is taking longer than expected. Check back later.");
        setGeneratingTranscript(false);
      }, 10 * 60 * 1000);

    } catch (error) {
      console.error("Error generating transcript:", error);
      setChunkingProgress("Processing failed - please try manual compression");
      setGeneratingTranscript(false);
    }
  };

  const loadPreview = async () => {
    try {
      if (asset.s3Url.startsWith("http")) {
        const response = await fetch("/api/assets/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s3Url: asset.s3Url }),
        });
        if (response.ok) {
          const data = await response.json();
          setPreviewUrl(data.url);
        } else {
          setPreviewUrl(asset.s3Url);
        }
      } else {
        setPreviewUrl(asset.s3Url);
      }
    } catch (error) {
      console.error("Error loading preview:", error);
      setPreviewUrl(asset.s3Url);
    }
  };

  const isImage = asset.fileType.startsWith("image/");
  const isPdf = asset.fileType === "application/pdf";
  const isVideo = asset.fileType.startsWith("video/");
  const isAudio = asset.fileType.startsWith("audio/");

  return (
    <div className="border rounded-lg p-4 bg-muted/50">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <h3 className="font-semibold">Asset Preview</h3>
          <div className="text-xs text-muted-foreground space-y-0.5">
            {asset.uploadedBy?.name || (asset as any).uploadedByNameOverride ? (
              <div>Uploaded by: {(asset as any).uploadedByNameOverride || asset.uploadedBy?.name}</div>
            ) : null}
            <div>Uploaded: {new Date(asset.createdAt).toLocaleDateString("en-US", { 
              year: "numeric", 
              month: "short", 
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}</div>
          </div>
        </div>
        {isImage && (
          <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full">
            <Sparkles className="w-3 h-3" />
            <span>Analyzed with GPT-4o Vision</span>
          </div>
        )}
        {(isVideo || isAudio) && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
            <Sparkles className="w-3 h-3" />
            <span>Transcribed with Whisper AI</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center min-h-[400px] bg-background rounded border">
        {previewUrl ? (
          <>
            {isImage ? (
              <img
                src={previewUrl}
                alt={asset.title}
                className="max-w-full max-h-[500px] object-contain"
              />
            ) : isPdf ? (
              <iframe
                src={previewUrl}
                className="w-full h-[500px] border-0 rounded"
                title={asset.title}
              />
            ) : isVideo ? (
              previewUrl && transcriptSegments.length > 0 ? (
                <VideoDeepSearch
                  asset={asset}
                  segments={transcriptSegments}
                  videoUrl={previewUrl}
                />
              ) : (
                <video
                  src={previewUrl}
                  controls
                  className="max-w-full max-h-[500px]"
                  title={asset.title}
                >
                  Your browser does not support video playback.
                </video>
              )
            ) : isAudio ? (
              <div className="flex flex-col items-center gap-4 p-8">
                <Music className="w-16 h-16 text-orange-500" />
                <audio
                  src={previewUrl}
                  controls
                  className="w-full max-w-md"
                  title={asset.title}
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <p>Preview not available for this file type</p>
                <p className="text-sm mt-2">{asset.fileType}</p>
              </div>
            )}
          </>
        ) : (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        )}
      </div>
      
      {/* Show extracted text for documents, or a note for images/videos */}
      {isImage ? (
        <div className="border rounded-lg p-4 mt-4 bg-purple-500/5 border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Image className="w-4 h-4 text-purple-500" />
            <h3 className="font-semibold text-sm">Image Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            This image was analyzed using GPT-4o&apos;s vision capabilities. Text, charts, and visual elements 
            were extracted and used for the AI analysis above.
          </p>
        </div>
      ) : (isVideo || isAudio) && asset.extractedText ? (
        <div className="border rounded-lg p-4 mt-4 bg-red-500/5 border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            {isVideo ? <Video className="w-4 h-4 text-red-500" /> : <Music className="w-4 h-4 text-orange-500" />}
            <h3 className="font-semibold text-sm">Transcript</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
            {asset.extractedText}
          </p>
        </div>
      ) : (isVideo || isAudio) ? (
        <div className="border rounded-lg p-4 mt-4 bg-red-500/5 border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            {isVideo ? <Video className="w-4 h-4 text-red-500" /> : <Music className="w-4 h-4 text-orange-500" />}
            <h3 className="font-semibold text-sm">Audio Analysis</h3>
          </div>
          {isVideo && segmentsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading transcript segments...
            </div>
          ) : isVideo && transcriptSegments.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              This video has {transcriptSegments.length} searchable transcript segments.
              Use the video player above for deep search functionality.
            </p>
          ) : chunkingProgress ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <p className="text-sm">{chunkingProgress}</p>
              </div>
              {compressionGuideFileSize && compressionGuideFileSize > 100 && (
                <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
                  💡 Large file detected ({compressionGuideFileSize}MB). Processing may take 15-30 minutes.
                  The video is being automatically split into smaller chunks for analysis.
                </div>
              )}
              {showCompressionGuide && compressionGuideFileSize && (
                <VideoCompressionGuide
                  fileSize={compressionGuideFileSize}
                  onClose={() => setShowCompressionGuide(false)}
                />
              )}
            </div>
          ) : showCompressionGuide && compressionGuideFileSize ? (
            <VideoCompressionGuide
              fileSize={compressionGuideFileSize}
              onClose={() => setShowCompressionGuide(false)}
            />
          ) : isVideo ? (
            <div className="space-y-3">
              {asset.status === "PROCESSING" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    This video is currently processing. For large files, this can take 15-30 minutes.
                    If processing is taking too long, you can cancel and use manual processing instead.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => {
                        // Estimate file size from asset (we'll use a default if unknown)
                        const estimatedSize = 465; // Default for large videos
                        setCompressionGuideFileSize(estimatedSize);
                        setShowCompressionGuide(true);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      📖 Show Manual Processing Guide
                    </Button>
                  </div>
                </>
              ) : asset.status === "ERROR" && asset.fileType.startsWith("video/") ? (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    Processing failed. For large videos (465MB), try processing just the first 10 minutes for faster results.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={async () => {
                        try {
                          setGeneratingTranscript(true);
                          setChunkingProgress("🔄 Starting background processing (first 10 minutes)...");

                          const response = await fetch(`/api/assets/${asset.id}/generate-transcript`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ processFirst10MinutesOnly: true }),
                          });

                          if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            setChunkingProgress(`Failed: ${errorData.details || "Unknown error"}`);
                            setGeneratingTranscript(false);
                            return;
                          }

                          // Clear any existing polling
                          if (pollIntervalRef.current) {
                            clearInterval(pollIntervalRef.current);
                          }

                          // Poll for job status (same as main handler)
                          pollIntervalRef.current = setInterval(async () => {
                            try {
                              const statusResponse = await fetch(`/api/assets/${asset.id}/transcript-status`);
                              if (statusResponse.ok) {
                                const statusData = await statusResponse.json();
                                const job = statusData.job;

                                if (job?.status === "COMPLETED") {
                                  if (pollIntervalRef.current) {
                                    clearInterval(pollIntervalRef.current);
                                    pollIntervalRef.current = null;
                                  }
                                  setChunkingProgress(`✅ Successfully processed first 10 minutes! ${statusData.segmentsCount} segments created.`);
                                  await loadTranscriptSegments();
                                  setTimeout(() => {
                                    setChunkingProgress(null);
                                    setGeneratingTranscript(false);
                                  }, 3000);
                                } else if (job?.status === "FAILED") {
                                  if (pollIntervalRef.current) {
                                    clearInterval(pollIntervalRef.current);
                                    pollIntervalRef.current = null;
                                  }
                                  
                                  const errorMessage = job.error || "Unknown error";
                                  setChunkingProgress(`❌ Processing failed: ${errorMessage}`);
                                  setGeneratingTranscript(false);
                                  
                                  // Show compression guide if it's a size error
                                  const fileSizeMatch = errorMessage.match(/(\d+)MB/);
                                  const detectedFileSize = fileSizeMatch ? parseInt(fileSizeMatch[1]) : null;
                                  
                                  if (errorMessage.includes("too large") || errorMessage.includes("File too large") || errorMessage.includes("Unable to process large video")) {
                                    setShowCompressionGuide(true);
                                    setCompressionGuideFileSize(detectedFileSize || 465);
                                  }
                                } else if (job?.status === "PROCESSING") {
                                  const progressText = job.progress 
                                    ? `🔄 Processing... ${job.progress}%`
                                    : "🔄 Processing in background...";
                                  setChunkingProgress(progressText);
                                }
                              }
                            } catch (pollError) {
                              console.error("Error polling job status:", pollError);
                            }
                          }, 2000);

                          // Safety timeout
                          setTimeout(() => {
                            if (pollIntervalRef.current) {
                              clearInterval(pollIntervalRef.current);
                              pollIntervalRef.current = null;
                            }
                            setChunkingProgress("⏱️ Processing is taking longer than expected.");
                            setGeneratingTranscript(false);
                          }, 5 * 60 * 1000); // 5 minutes for 10-minute processing

                        } catch (error) {
                          console.error("Error processing first 10 minutes:", error);
                          setChunkingProgress("Processing failed");
                          setGeneratingTranscript(false);
                        }
                      }}
                      disabled={generatingTranscript}
                      size="sm"
                      variant="default"
                    >
                      {generatingTranscript && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      ⚡ Process First 10 Minutes Only
                    </Button>
                    <Button
                      onClick={() => {
                        const estimatedSize = 465;
                        setCompressionGuideFileSize(estimatedSize);
                        setShowCompressionGuide(true);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      📖 Manual Guide
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    This video was transcribed using OpenAI Whisper and analyzed for B2B insights.
                    Generate transcript segments to enable deep search functionality.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleGenerateTranscript}
                      disabled={generatingTranscript}
                      size="sm"
                      variant="outline"
                    >
                      {generatingTranscript && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Generate Transcript Segments
                    </Button>
                    <Button
                      onClick={() => {
                        // Estimate file size from asset
                        const estimatedSize = 465; // Default for large videos
                        setCompressionGuideFileSize(estimatedSize);
                        setShowCompressionGuide(true);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      📖 Manual Guide
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This {isVideo ? "video" : "audio"} was transcribed using OpenAI Whisper and analyzed for B2B insights.
              The transcript will appear here once processing is complete.
            </p>
          )}
        </div>
      ) : (asset.extractedText || extractedTextValue) ? (
        <EditableExtractedText
          text={extractedTextValue ?? asset.extractedText ?? ""}
          onChange={onExtractedTextChange}
          editable={!!onExtractedTextChange}
        />
      ) : null}
    </div>
  );
}
