import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { extractKeyFromS3Url } from "../s3";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { platform } from "os";
import { processVideoFromS3 } from "./video-transcriber";

    // Dynamically set ffmpeg path based on platform
    // This function is called at runtime, not at module load time, to avoid webpack bundling issues
    function setFfmpegPath() {
      try {
        let ffmpegPath: { path: string } | null = null;
        const currentPlatform = platform();
        const currentArch = process.arch;

        // Use eval to make require() dynamic and prevent webpack from bundling
        const dynamicRequire = (moduleName: string) => {
          return eval('require')(moduleName);
        };
    
    if (currentPlatform === "darwin") {
      // Check if it's ARM64 (Apple Silicon) or x64 (Intel)
      if (currentArch === "arm64") {
        ffmpegPath = dynamicRequire("@ffmpeg-installer/darwin-arm64");
      } else {
        ffmpegPath = dynamicRequire("@ffmpeg-installer/darwin-x64");
      }
    } else if (currentPlatform === "linux") {
      if (currentArch === "arm64") {
        ffmpegPath = dynamicRequire("@ffmpeg-installer/linux-arm64");
      } else {
        ffmpegPath = dynamicRequire("@ffmpeg-installer/linux-x64");
      }
    } else if (currentPlatform === "win32") {
      ffmpegPath = dynamicRequire("@ffmpeg-installer/win32-x64");
    } else {
      // Fallback: try to use system ffmpeg if available
      console.warn(`[FFMPEG] Unsupported platform: ${currentPlatform}, trying system ffmpeg`);
      return; // Don't set path, let fluent-ffmpeg use system ffmpeg
    }
    
    if (ffmpegPath && ffmpegPath.path) {
      ffmpeg.setFfmpegPath(ffmpegPath.path);
      console.log(`[FFMPEG] Using platform-specific ffmpeg: ${ffmpegPath.path}`);
    }
  } catch (error) {
    console.warn("[FFMPEG] Could not load platform-specific ffmpeg installer, trying system ffmpeg:", error);
    // Fallback: use system ffmpeg if available
  }
}

// Set ffmpeg path when module loads (but only on server side)
if (typeof window === 'undefined') {
  setFfmpegPath();
}

// ============================================================================
// VIDEO ANALYSIS MODULE - "Audio-First" MVP Approach
// ============================================================================
//
// STRATEGY: For B2B content, 90% of the value is in WHAT IS SAID, not what is seen.
// This module extracts audio → transcribes with Whisper → analyzes the transcript.
//
// SUPPORTED USE CASES:
// - Podcast episodes
// - Founder/CEO video messages
// - Talking head videos
// - Webinar recordings
// - Customer testimonials
//
// AUDIO EXTRACTION:
// - For large video files (>25MB), we extract just the audio track using ffmpeg
// - This typically reduces file size by 90%+ (video is the heavy part)
// - Audio is extracted as MP3 at 64kbps mono (optimized for speech)
//
// LIMITATIONS (by design):
// - Does NOT analyze visual frames (slides, product demos)
// - For visual analysis, users should export slides as images and use image-analyzer
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

// Maximum file size for Whisper API (25MB)
const MAX_WHISPER_FILE_SIZE = 25 * 1024 * 1024;

// Maximum file size we'll attempt to process (500MB) - larger files should use dedicated media processing
const MAX_PROCESSABLE_SIZE = 500 * 1024 * 1024;

// Supported video formats (check with startsWith for broader compatibility)
const SUPPORTED_VIDEO_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/webm",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/x-m4v",
  "video/3gpp",
  "video/x-matroska", // .mkv
];

// Supported audio formats (if user uploads audio directly)
const SUPPORTED_AUDIO_TYPES = [
  "audio/mpeg", // .mp3
  "audio/mp4",  // .m4a
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
];

// ============================================================================
// AUDIO EXTRACTION (for large video files)
// ============================================================================

// FFmpeg path is already set at the top level import

/**
 * Extract audio from a video file using fluent-ffmpeg.
 * This reduces file size dramatically (video is the heavy part).
 * Output is MP3 at 64kbps mono - optimized for speech recognition.
 * 
 * @param videoBuffer - The video file as a Buffer
 * @param inputFileName - Original filename (for format detection)
 * @returns Buffer containing extracted MP3 audio
 */
async function extractAudioFromVideo(
  videoBuffer: Buffer,
  inputFileName: string
): Promise<Buffer> {
  console.log(`[FFMPEG] Starting audio extraction from ${inputFileName} (${Math.round(videoBuffer.length / 1024 / 1024)}MB)`);

  const tempId = randomUUID();
  const inputExt = inputFileName.split('.').pop()?.toLowerCase() || 'mp4';
  const inputPath = join(tmpdir(), `${tempId}-input.${inputExt}`);
  const outputPath = join(tmpdir(), `${tempId}-output.mp3`);

  try {
    // Write input video to temp file
    console.log("[FFMPEG] Writing video to temp file...");
    await writeFile(inputPath, videoBuffer);
    console.log(`[FFMPEG] Input file written: ${inputPath}`);

    // Extract audio using fluent-ffmpeg
    console.log("[FFMPEG] Extracting audio...");
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("64k")
        .audioChannels(1)
        .audioFrequency(16000)
        .output(outputPath)
        .on("start", (cmd) => {
          console.log("[FFMPEG] Command:", cmd);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            console.log(`[FFMPEG] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on("end", () => {
          console.log("[FFMPEG] Extraction complete");
          resolve();
        })
        .on("error", (err, stdout, stderr) => {
          console.error("[FFMPEG] Error:", err);
          console.error("[FFMPEG] Stdout:", stdout);
          console.error("[FFMPEG] Stderr:", stderr);
          reject(err);
        })
        .run();
    });

    // Read output file
    console.log("[FFMPEG] Reading extracted audio...");
    const audioBuffer = await readFile(outputPath);
    console.log(`[FFMPEG] Audio file size: ${Math.round(audioBuffer.length / 1024)}KB`);

    console.log(`[FFMPEG] Audio extraction complete: ${Math.round(audioBuffer.length / 1024)}KB (${Math.round((1 - audioBuffer.length / videoBuffer.length) * 100)}% size reduction)`);

    return audioBuffer;

  } catch (error) {
    console.error("[FFMPEG] Audio extraction failed:", error);
    console.error("[FFMPEG] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      tempId,
      inputPath,
      outputPath,
      inputSize: videoBuffer.length,
    });
    throw new Error(`Failed to extract audio from video: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    // Clean up temp files
    try {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// TRANSCRIPT ANALYSIS SCHEMA
// ============================================================================

const SpeakerInsightSchema = z.object({
  speakerLabel: z.string()
    .describe("Label for the speaker (e.g., 'Speaker 1', 'Host', 'Guest', or name if identified)."),
  
  keyPoints: z.array(z.string())
    .max(5)
    .describe("Main points made by this speaker."),
  
  estimatedRole: z.string().nullable()
    .describe("Inferred role (e.g., 'CEO', 'Customer', 'Interviewer', 'Product Expert')."),
});

const TranscriptSnippetSchema = z.object({
  type: z.enum([
    "ROI_STAT",          // Mentioned metrics or results
    "CUSTOMER_QUOTE",    // Testimonial or endorsement
    "VALUE_PROP",        // Product/service value statement
    "COMPETITIVE_WEDGE", // Comparison to competitors
    "PAIN_POINT",        // Problem being discussed
    "CALL_TO_ACTION",    // Ask or next step mentioned
  ]).describe("The category of this spoken content."),

  content: z.string()
    .max(280)
    .describe("The exact quote or paraphrased statement (under 280 chars for social readiness)."),

  timestamp: z.string().nullable()
    .describe("Approximate timestamp if detectable (e.g., '2:30')."),
    
  speaker: z.string().nullable()
    .describe("Who said this (if identifiable)."),
    
  context: z.string()
    .describe("How/when to use this snippet (e.g., 'Use in email sequence for objection handling')."),
    
  confidenceScore: z.number().min(1).max(100)
    .describe("How clear and valuable is this snippet? 100 = Perfect sound bite."),
});

const VideoAnalysisSchema = z.object({
  // Content classification
  contentType: z.enum([
    "PODCAST_EPISODE",
    "WEBINAR_RECORDING", 
    "PRODUCT_DEMO",
    "CUSTOMER_TESTIMONIAL",
    "FOUNDER_MESSAGE",
    "INTERVIEW",
    "PRESENTATION",
    "TUTORIAL",
    "OTHER"
  ]).describe("The type of video content."),
  
  // Full transcript
  transcript: z.string()
    .describe("The full transcription of the audio."),
  
  // Executive summary
  summary: z.string()
    .max(500)
    .describe("A brief executive summary of the video content (max 500 chars)."),
  
  // Speaker insights (if multiple speakers detected)
  speakers: z.array(SpeakerInsightSchema)
    .max(5)
    .describe("Insights about each speaker (if multiple speakers detected)."),
  
  // Extracted snippets (the gold nuggets)
  snippets: z.array(TranscriptSnippetSchema)
    .max(10)
    .describe("Extracted valuable quotes, stats, and talking points."),
  
  // Topics covered
  topics: z.array(z.string())
    .max(8)
    .describe("Main topics or themes discussed in the video."),
  
  // Pain points mentioned
  painPointsMentioned: z.array(z.string())
    .max(5)
    .describe("Customer pain points or problems discussed."),
  
  // Suggested asset type for the content
  suggestedAssetType: z.enum([
    "Whitepaper", "Case_Study", "Blog_Post", "Infographic", 
    "Webinar_Recording", "Sales_Deck", "Technical_Doc"
  ]).describe("Based on the content, what marketing asset type best represents this?"),
  
  // Audio quality assessment
  audioQualityScore: z.number().min(1).max(100)
    .describe("Overall audio quality. 100 = Studio quality, clear speech."),
  
  // Duration estimate
  estimatedDurationMinutes: z.number()
    .describe("Estimated duration of the video in minutes."),
});

export type VideoAnalysisResult = z.infer<typeof VideoAnalysisSchema>;
export type TranscriptSnippet = z.infer<typeof TranscriptSnippetSchema>;
export type SpeakerInsight = z.infer<typeof SpeakerInsightSchema>;

// ============================================================================
// TRANSCRIPTION FUNCTION (Whisper API)
// ============================================================================

/**
 * Prepare an audio buffer that satisfies Whisper's 25MB limit.
 * If a video exceeds the limit, we try to extract a compressed MP3 audio track.
 */
async function prepareWhisperInput(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
): Promise<{ audioBuffer: Buffer; audioFileName: string; extractedAudio: boolean }> {
  let audioBuffer = fileBuffer;
  let audioFileName = fileName;
  let extractedAudio = false;

  if (fileBuffer.length > MAX_WHISPER_FILE_SIZE) {
    console.log(`[WHISPER] File is ${Math.round(fileBuffer.length / 1024 / 1024)}MB, exceeds 25MB limit`);

    if (fileBuffer.length > MAX_PROCESSABLE_SIZE) {
      throw new Error(
        `File too large (${Math.round(fileBuffer.length / 1024 / 1024)}MB). ` +
          `Maximum processable size is 500MB. Please compress the video first.`
      );
    }

    // If it's a video, extract audio
    if (fileType.startsWith("video/")) {
      console.log("[WHISPER] Extracting audio from video to reduce file size...");
      try {
        audioBuffer = await extractAudioFromVideo(fileBuffer, fileName);
        audioFileName = fileName.replace(/\.[^.]+$/, ".mp3");
        extractedAudio = true;

        if (audioBuffer.length > MAX_WHISPER_FILE_SIZE) {
          throw new Error(
            `Extracted audio is still too large (${Math.round(audioBuffer.length / 1024 / 1024)}MB). ` +
              `This video may have very long audio. Please trim the video to under 2 hours.`
          );
        }

        console.log(`[WHISPER] Audio extracted: ${Math.round(audioBuffer.length / 1024)}KB`);
      } catch (extractionError) {
        console.warn("[WHISPER] Audio extraction failed, trying to process video directly:", extractionError);

        // Fallback: try to process the video directly if it's not too much larger than the limit
        if (fileBuffer.length <= MAX_WHISPER_FILE_SIZE * 2) {
          console.log("[WHISPER] Attempting to process video directly as fallback");
          audioBuffer = fileBuffer;
          audioFileName = fileName;
          extractedAudio = false;
        } else {
          throw new Error(
            `Audio extraction failed and video is too large (${Math.round(fileBuffer.length / 1024 / 1024)}MB). ` +
              `${Math.round(fileBuffer.length / 1024 / 1024) > 100
                ? `For very large videos, please compress using tools like:\n` +
                  `• HandBrake (free, recommended)\n` +
                  `• Adobe Media Encoder\n` +
                  `• FFmpeg command: ffmpeg -i input.mp4 -vf scale=1280:-1 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k output.mp4\n` +
                  `Target file size: under 25MB for direct upload, or under 500MB for processing.`
                : `Please try:\n` +
                  `1. Compress the video using HandBrake or similar tool\n` +
                  `2. Extract audio manually: ffmpeg -i video.mp4 -vn -acodec libmp3lame -ab 64k audio.mp3\n` +
                  `3. Upload the compressed video or extracted audio instead`}`
          );
        }
      }
    } else {
      throw new Error(
        `Audio file too large (${Math.round(fileBuffer.length / 1024 / 1024)}MB). ` +
          `Maximum size for audio is 25MB. Please compress the audio first.`
      );
    }
  }

  return { audioBuffer, audioFileName, extractedAudio };
}

/**
 * Transcribe audio/video using OpenAI Whisper API.
 *
 * @param fileBuffer - The audio/video file as a Buffer
 * @param fileName - Original filename (for format detection)
 * @param fileType - MIME type of the file
 * @returns Transcription text
 */
async function transcribeWithWhisper(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
): Promise<string> {
  const { audioBuffer, audioFileName, extractedAudio } = await prepareWhisperInput(
    fileBuffer,
    fileName,
    fileType
  );

  // Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm
  const mimeType = extractedAudio ? "audio/mpeg" : getMimeType(audioFileName);
  const file = new File([new Uint8Array(audioBuffer)], audioFileName, { type: mimeType });

  console.log(
    `[WHISPER] Transcribing ${audioFileName} (${Math.round(audioBuffer.length / 1024)}KB, type: ${mimeType})...`
  );

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "text",
    language: "en", // Can be made configurable
  });

  console.log(`[WHISPER] Transcription complete: ${transcription.length} characters`);
  return transcription;
}

/**
 * Transcribe audio/video and return segments with timestamps.
 * This is used for video deep search functionality.
 *
 * @param fileBuffer - The audio/video file as a Buffer
 * @param fileName - Original filename (for format detection)
 * @param fileType - MIME type of the file
 * @returns Object with transcription text and segments array
 */
async function transcribeWithSegments(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
): Promise<{ text: string; segments: any[] }> {
  const { audioBuffer, audioFileName, extractedAudio } = await prepareWhisperInput(
    fileBuffer,
    fileName,
    fileType
  );

  const mimeType = extractedAudio ? "audio/mpeg" : getMimeType(audioFileName);
  const file = new File([new Uint8Array(audioBuffer)], audioFileName, { type: mimeType });

  console.log(
    `[WHISPER] Transcribing with segments: ${audioFileName} (${Math.round(audioBuffer.length / 1024)}KB, type: ${mimeType})...`
  );

  const transcription: any = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    language: "en", // Can be made configurable
  });

  console.log(
    `[WHISPER] Transcription with segments complete: ${transcription.segments?.length || 0} segments`
  );

  return {
    text: transcription.text || "",
    segments: transcription.segments || [],
  };
}

/**
 * Get MIME type from filename
 */
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mpeg: "video/mpeg",
    mpg: "video/mpeg",
    ogg: "audio/ogg",
    flac: "audio/flac",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

// ============================================================================
// TRANSCRIPT ANALYSIS FUNCTION
// ============================================================================

const VIDEO_ANALYSIS_PROMPT = `You are an expert B2B content analyst specializing in extracting insights from video transcripts.

Your goal is to analyze the transcript and extract:
1. **Key Talking Points** - What are the main messages?
2. **Quotable Snippets** - What can be used in marketing materials?
3. **Pain Points** - What problems are being discussed?
4. **Speaker Insights** - Who is speaking and what's their perspective?

*** EXTRACTION RULES ***

1. **QUOTES MUST BE EXACT OR CLOSELY PARAPHRASED**
   - Don't invent statistics or quotes
   - If something is unclear, lower the confidence score

2. **PRIORITIZE ACTIONABLE CONTENT**
   - ROI stats with specific numbers
   - Customer testimonials
   - Clear value propositions
   - Competitive comparisons

3. **CONTEXT IS CRITICAL**
   - For every snippet, explain WHEN to use it
   - Example: "Use in cold email to address budget concerns"

4. **SPEAKER IDENTIFICATION**
   - If names are mentioned, use them
   - Otherwise use "Speaker 1", "Host", "Guest", etc.
   - Try to infer roles from context (CEO, customer, interviewer)

5. **QUALITY FILTERING**
   - If the transcript is mostly filler/small talk, return fewer snippets
   - Focus on substantive content

*** CONTENT TYPE CLASSIFICATION ***

- PODCAST_EPISODE: Long-form discussion, multiple speakers, educational
- WEBINAR_RECORDING: Structured presentation with Q&A
- PRODUCT_DEMO: Walkthrough of features/functionality
- CUSTOMER_TESTIMONIAL: Customer sharing their experience
- FOUNDER_MESSAGE: CEO/founder addressing audience
- INTERVIEW: Q&A format with host and guest
- PRESENTATION: Speaker presenting to audience
- TUTORIAL: How-to or educational content
- OTHER: Doesn't fit above categories
`;

/**
 * Analyze a transcript using GPT-4o.
 * 
 * @param transcript - The transcribed text
 * @param additionalContext - Optional context about the video
 * @returns Structured analysis of the transcript
 */
async function analyzeTranscript(
  transcript: string,
  additionalContext?: string
): Promise<VideoAnalysisResult> {
  // Estimate duration based on word count (avg speaking rate: 150 words/min)
  const wordCount = transcript.split(/\s+/).length;
  const estimatedMinutes = Math.round(wordCount / 150);

  // Truncate very long transcripts (GPT-4o has 128k context but we want to save cost)
  const safeTranscript = transcript.length > 80000
    ? transcript.slice(0, 80000) + "\n\n[TRANSCRIPT TRUNCATED FOR LENGTH]"
    : transcript;

  const userPrompt = additionalContext
    ? `Analyze this video transcript. Additional context: ${additionalContext}\n\nTRANSCRIPT:\n${safeTranscript}`
    : `Analyze this video transcript:\n\nTRANSCRIPT:\n${safeTranscript}`;

  const completion = await openai.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: VIDEO_ANALYSIS_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: zodResponseFormat(VideoAnalysisSchema, "video_analysis"),
    temperature: 0.2,
  });

  const result = completion.choices[0].message.parsed;

  if (!result) {
    throw new Error("AI failed to generate structured video analysis");
  }

  // Override with calculated duration and full transcript
  return {
    ...result,
    transcript: transcript, // Keep full transcript
    estimatedDurationMinutes: estimatedMinutes,
  };
}

// ============================================================================
// MAIN VIDEO ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze a video file using the "Audio-First" approach:
 * 1. Download video from S3
 * 2. Transcribe audio with Whisper
 * 3. Save transcript segments for deep search (if assetId provided)
 * 4. Analyze transcript with GPT-4o
 *
 * @param s3Url - The S3 URL of the video file
 * @param fileName - Original filename
 * @param fileType - MIME type of the file
 * @param additionalContext - Optional context about the video
 * @param assetId - Optional asset ID for saving transcript segments
 * @returns Structured analysis of the video content
 */
export async function analyzeVideo(
  s3Url: string,
  fileName: string,
  fileType: string,
  additionalContext?: string,
  assetId?: string
): Promise<VideoAnalysisResult> {
  try {
    console.log(`[VIDEO] Starting video analysis for: ${fileName} (${fileType})`);
    
    // 1. Download video from S3
    const key = extractKeyFromS3Url(s3Url);
    if (!key) {
      throw new Error("Could not extract key from S3 URL");
    }

    if (!BUCKET_NAME) {
      throw new Error("AWS_S3_BUCKET_NAME is not configured");
    }
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error("Empty file body from S3");
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as any;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const fileBuffer = Buffer.concat(chunks);
    console.log(`[VIDEO] Downloaded: ${Math.round(fileBuffer.length / 1024 / 1024)}MB`);

    // 2. Transcribe with Whisper (extracts audio automatically for large videos)
    const transcript = await transcribeWithWhisper(fileBuffer, fileName, fileType);

    if (!transcript || transcript.trim().length === 0) {
      throw new Error("No speech detected in video. The video may be silent or contain only music.");
    }

    // 3. Process video for deep search (save transcript segments with timestamps)
    // Only save segments if assetId is provided
    if (assetId) {
      try {
        await processVideoFromS3(assetId, s3Url, fileName, fileType);
        console.log(`[VIDEO] Saved transcript segments for deep search: asset ${assetId}`);
      } catch (segmentError) {
        console.warn(`[VIDEO] Failed to save transcript segments:`, segmentError);
        // Don't fail the entire analysis if segment saving fails
      }
    }

    // 4. Analyze transcript with GPT-4o
    const analysis = await analyzeTranscript(transcript, additionalContext);

    console.log(`Video analysis complete: ${analysis.snippets.length} snippets extracted`);
    
    return analysis;

  } catch (error) {
    console.error("Error analyzing video:", error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a file type is supported for video analysis
 */
export function isAnalyzableVideo(fileType: string): boolean {
  const type = fileType.toLowerCase();
  // Check if it starts with video/ (catches all video types)
  // or is in our explicit list (for edge cases)
  return type.startsWith("video/") || SUPPORTED_VIDEO_TYPES.includes(type);
}

/**
 * Check if a file type is supported audio
 */
export function isAnalyzableAudio(fileType: string): boolean {
  const type = fileType.toLowerCase();
  // Check if it starts with audio/ (catches all audio types)
  // or is in our explicit list (for edge cases)
  return type.startsWith("audio/") || SUPPORTED_AUDIO_TYPES.includes(type);
}

/**
 * Check if a file type is supported for audio/video analysis
 */
export function isAnalyzableMedia(fileType: string): boolean {
  return isAnalyzableVideo(fileType) || isAnalyzableAudio(fileType);
}

/**
 * Get supported video file extensions
 */
export function getSupportedVideoExtensions(): string[] {
  return [".mp4", ".mov", ".avi", ".webm", ".mpeg", ".m4v"];
}

/**
 * Get supported audio file extensions
 */
export function getSupportedAudioExtensions(): string[] {
  return [".mp3", ".m4a", ".wav", ".webm", ".ogg", ".flac"];
}

/**
 * Convert video analysis result to text for the main asset analyzer
 * This allows video content to flow through the existing text analysis pipeline
 */
export function videoAnalysisToText(analysis: VideoAnalysisResult): string {
  const parts = [
    `[VIDEO TRANSCRIPT - ${analysis.contentType}]`,
    ``,
    `SUMMARY: ${analysis.summary}`,
    ``,
    `TOPICS: ${analysis.topics.join(", ")}`,
    ``,
    `PAIN POINTS DISCUSSED: ${analysis.painPointsMentioned.join(", ")}`,
    ``,
    `--- FULL TRANSCRIPT ---`,
    analysis.transcript,
    ``,
    `--- KEY SNIPPETS ---`,
    ...analysis.snippets.map(s => `[${s.type}] "${s.content}" - ${s.context}`),
  ];

  return parts.join("\n");
}
