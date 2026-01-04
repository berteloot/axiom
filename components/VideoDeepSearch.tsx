"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Asset, TranscriptSegment } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Play, Clock } from "lucide-react";

interface VideoDeepSearchProps {
  asset: Asset;
  segments: TranscriptSegment[];
  videoUrl: string;
}

export function VideoDeepSearch({ asset, segments, videoUrl }: VideoDeepSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Filter segments based on search query
  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;

    const query = searchQuery.toLowerCase();
    return segments.filter(segment =>
      segment.text.toLowerCase().includes(query)
    );
  }, [segments, searchQuery]);

  // Find the current segment based on video time
  const currentSegmentIndex = useMemo(() => {
    for (let i = 0; i < segments.length; i++) {
      if (currentTime >= segments[i].startTime && currentTime < segments[i].endTime) {
        return i;
      }
    }
    return -1;
  }, [segments, currentTime]);

  // Auto-scroll to current segment
  useEffect(() => {
    if (currentSegmentIndex >= 0 && transcriptRef.current) {
      const segmentElement = transcriptRef.current.querySelector(
        `[data-segment-index="${currentSegmentIndex}"]`
      ) as HTMLElement;

      if (segmentElement) {
        segmentElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [currentSegmentIndex]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  // Jump to segment time
  const jumpToTime = (startTime: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Highlight search matches in text
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return <>{text}</>;

    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, index) =>
          regex.test(part) ? (
            <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Video Player Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold">Video Player</h3>
        </div>

        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full aspect-video"
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            title={asset.title}
          >
            Your browser does not support video playback.
          </video>

          {/* Current time overlay */}
          <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-sm font-mono">
            {formatTime(currentTime)}
          </div>
        </div>

        {/* Video info */}
        <div className="text-sm text-muted-foreground">
          <p><strong>Title:</strong> {asset.title}</p>
          <p><strong>Duration:</strong> {segments.length > 0 ? formatTime(Math.max(...segments.map(s => s.endTime))) : "Unknown"}</p>
          <p><strong>Segments:</strong> {segments.length}</p>
        </div>
      </div>

      {/* Transcript Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-green-500" />
            <h3 className="font-semibold">Transcript Search</h3>
          </div>
          {isPlaying && (
            <Badge variant="secondary" className="animate-pulse">
              Playing
            </Badge>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Transcript List */}
        <div className="h-[500px] border rounded-lg p-4 overflow-y-auto" ref={transcriptRef}>
          {filteredSegments.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {searchQuery ? "No matches found" : "No transcript segments available"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSegments.map((segment, index) => {
                const isCurrent = segments.indexOf(segment) === currentSegmentIndex;
                const originalIndex = segments.indexOf(segment);

                return (
                  <div
                    key={segment.id}
                    data-segment-index={originalIndex}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                      isCurrent
                        ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
                        : "border-border"
                    }`}
                    onClick={() => jumpToTime(segment.startTime)}
                  >
                    {/* Time and Speaker */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(segment.startTime)}</span>
                      </div>
                      {segment.speaker && (
                        <Badge variant="outline" className="text-xs">
                          {segment.speaker}
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge variant="default" className="text-xs bg-blue-500">
                          Now Playing
                        </Badge>
                      )}
                    </div>

                    {/* Transcript Text */}
                    <p className="text-sm leading-relaxed">
                      {highlightText(segment.text, searchQuery)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Search Results Info */}
        {searchQuery && (
          <div className="text-sm text-muted-foreground">
            Found {filteredSegments.length} of {segments.length} segments
          </div>
        )}
      </div>
    </div>
  );
}