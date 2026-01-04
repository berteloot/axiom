"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, ExternalLink } from "lucide-react";

interface VideoCompressionGuideProps {
  fileSize: number; // in MB
  onClose?: () => void;
}

export function VideoCompressionGuide({ fileSize, onClose }: VideoCompressionGuideProps) {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(label);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const isVeryLarge = fileSize > 100;

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant="destructive">Video Too Large</Badge>
          {fileSize}MB file detected
        </CardTitle>
        <CardDescription>
          Your video exceeds the processing limit. The system first tries automatic chunking, but if that fails, here are manual compression options.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
          <h5 className="font-semibold text-green-800 dark:text-green-200 mb-2">🤖 Automatic Processing</h5>
          <p className="text-sm text-green-700 dark:text-green-300">
            The app automatically tries multiple strategies in order:
          </p>
          <ol className="text-sm text-green-700 dark:text-green-300 list-decimal list-inside mt-2 space-y-1">
            <li><strong>Automatic compression</strong> - Compresses videos &gt;50MB using FFmpeg</li>
            <li><strong>Audio extraction</strong> - Extracts audio track (90%+ size reduction)</li>
            <li><strong>Smart chunking</strong> - Splits into 10-minute segments if needed</li>
            <li><strong>First 10 minutes only</strong> - Fast fallback for very large files</li>
          </ol>
          <p className="text-sm text-green-700 dark:text-green-300 mt-2">
            Only use manual compression if all automatic strategies fail.
          </p>
        </div>

        <Tabs defaultValue="handbrake" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="handbrake">HandBrake</TabsTrigger>
            <TabsTrigger value="ffmpeg">FFmpeg</TabsTrigger>
            <TabsTrigger value="online">Online Tools</TabsTrigger>
            <TabsTrigger value="manual">Manual Audio</TabsTrigger>
          </TabsList>

          <TabsContent value="handbrake" className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-green-600">HandBrake (Recommended - Free & Easy)</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Download and install <a href="https://handbrake.fr/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">HandBrake</a></li>
                <li>Open your video file in HandBrake</li>
                <li>Choose a preset (Fast 1080p30 or similar)</li>
                <li>Adjust quality settings if needed (RF: 28-32)</li>
                <li>Click &quot;Start Encode&quot; to compress</li>
              </ol>
              <div className="bg-muted p-3 rounded text-xs">
                <strong>Target:</strong> Aim for under 25MB for instant processing, or under 500MB for server-side compression.
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ffmpeg" className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-blue-600">FFmpeg (Command Line)</h4>
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> The app now automatically compresses videos using similar FFmpeg commands!
                Only use these if automatic compression fails.
              </p>
              <p className="text-sm text-muted-foreground">Install FFmpeg, then run one of these commands:</p>

              <div className="space-y-2">
                <div className="flex items-start gap-2 p-2 bg-muted rounded">
                  <code className="flex-1 text-xs font-mono">
                    ffmpeg -i input.mp4 -vf scale=1280:-1 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard('ffmpeg -i input.mp4 -vf scale=1280:-1 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4', 'basic')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>

                {isVeryLarge && (
                  <div className="flex items-start gap-2 p-2 bg-muted rounded">
                    <code className="flex-1 text-xs font-mono">
                      ffmpeg -i input.mp4 -vf scale=854:-1 -c:v libx264 -crf 32 -preset faster -c:a aac -b:a 96k -r 24 output.mp4
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard('ffmpeg -i input.mp4 -vf scale=854:-1 -c:v libx264 -crf 32 -preset faster -c:a aac -b:a 96k -r 24 output.mp4', 'aggressive')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {copiedCommand && <span className="text-green-600">✓ {copiedCommand} command copied!</span>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="online" className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-purple-600">Online Compression Tools</h4>
              <p className="text-sm text-muted-foreground">Free online tools (be careful with sensitive content):</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <a
                  href="https://www.freeconvert.com/video-compressor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded hover:bg-muted transition-colors"
                >
                  <span>FreeConvert</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                <a
                  href="https://www.ilovepdf.com/compress-pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded hover:bg-muted transition-colors"
                >
                  <span>iLovePDF</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                <a
                  href="https://www.veezy.com/video-compressor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded hover:bg-muted transition-colors"
                >
                  <span>Veezy</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                <a
                  href="https://www.media.io/video-compressor.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border rounded hover:bg-muted transition-colors"
                >
                  <span>Media.io</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-orange-600">Extract Audio Only</h4>
              <p className="text-sm text-muted-foreground">
                If you only need transcription, extract the audio track (much smaller):
              </p>

              <div className="flex items-start gap-2 p-2 bg-muted rounded">
                <code className="flex-1 text-xs font-mono">
                  ffmpeg -i input.mp4 -vn -acodec libmp3lame -ab 32k -ac 1 -ar 16000 output.mp3
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard('ffmpeg -i input.mp4 -vn -acodec libmp3lame -ab 32k -ac 1 -ar 16000 output.mp3', 'audio')}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                This creates a 32kbps mono MP3 optimized for speech recognition.
                A 1-hour video becomes ~14MB, fitting comfortably under the 25MB limit.
                Upload the MP3 file instead of the video.
              </p>

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h5 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">🎯 Quick Test Option</h5>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  For testing deep search, truncate to first 10 minutes:
                </p>
                <div className="flex items-start gap-2 p-2 bg-white dark:bg-gray-800 rounded">
                  <code className="flex-1 text-xs font-mono">
                    ffmpeg -i input.mp4 -t 600 -c copy output_10min.mp4
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard('ffmpeg -i input.mp4 -t 600 -c copy output_10min.mp4', 'truncate')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Creates a 10-minute version (600 seconds) - usually much smaller and perfect for testing!
                </p>

                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <h6 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">🚀 Fast Manual Processing</h6>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                    For immediate results, extract audio from first 5 minutes:
                  </p>
                  <div className="flex items-start gap-2 p-2 bg-white dark:bg-gray-800 rounded">
                    <code className="flex-1 text-xs font-mono">
                      ffmpeg -i input.mp4 -t 300 -vn -acodec libmp3lame -ab 64k first_5min.mp3
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard('ffmpeg -i input.mp4 -t 300 -vn -acodec libmp3lame -ab 64k first_5min.mp3', 'fast_audio')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                    Upload the MP3 file - processes in 1-2 minutes!
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h5 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 Pro Tips</h5>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Target file size: <strong>&lt;25MB</strong> for instant processing</li>
            <li>• Keep resolution reasonable (1080p or lower for most content)</li>
            <li>• CRF 28-32 provides good quality/size balance</li>
            <li>• Lower frame rate (24fps) for talking head videos</li>
            {isVeryLarge && (
              <li>• For {fileSize}MB files, expect 80-90% size reduction with compression</li>
            )}
          </ul>
        </div>

        {onClose && (
          <div className="flex justify-end mt-4">
            <Button onClick={onClose} variant="outline">
              Close Guide
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}