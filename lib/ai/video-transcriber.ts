import OpenAI from "openai";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { extractKeyFromS3Url } from "../s3";
import { prisma } from "../prisma";
import { TranscriptSegment } from "../types";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink, createWriteStream } from "fs/promises";
import { createWriteStream as createWriteStreamSync } from "fs";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";

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

// Maximum file size for streaming download (450MB) - prevents disk space issues
const MAX_STREAMING_SIZE = 450 * 1024 * 1024;

// ============================================================================
// FFMPEG SETUP (for audio extraction)
// ============================================================================

// Set ffmpeg path using ffmpeg-static (portable, works on all platforms)
function setFfmpegPath() {
  try {
    // Use dynamic require to prevent webpack from bundling ffmpeg-static at build time
    const ffmpegStatic = eval('require')('ffmpeg-static');
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
      console.log(`[FFMPEG] Using ffmpeg-static: ${ffmpegStatic}`);
    }
  } catch (error) {
    console.warn("[FFMPEG] ffmpeg-static not available, trying system ffmpeg:", error);
    // Fallback: use system ffmpeg if available (e.g., installed via apt-get on Render)
  }
}

// Set ffmpeg path when module loads (but only on server side)
if (typeof window === 'undefined') {
  setFfmpegPath();
}

// ============================================================================
// STREAMING S3 DOWNLOAD (Memory-Safe)
// ============================================================================

/**
 * Stream S3 download directly to disk to avoid memory issues
 * @param s3Key - S3 object key
 * @param tempFilePath - Path to temporary file (will be created)
 * @returns Path to the downloaded file
 */
async function streamS3ToDisk(s3Key: string, tempFilePath: string): Promise<string> {
  // First, check file size using HeadObjectCommand
  const headCommand = new HeadObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });

  const headResponse = await s3Client.send(headCommand);
  const fileSize = headResponse.ContentLength || 0;

  if (fileSize > MAX_STREAMING_SIZE) {
    throw new Error(
      `File too large (${Math.round(fileSize / 1024 / 1024)}MB) for current server memory tier. ` +
      `Maximum size is ${Math.round(MAX_STREAMING_SIZE / 1024 / 1024)}MB. Please compress the video first.`
    );
  }

  console.log(`[STREAM] Streaming ${Math.round(fileSize / 1024 / 1024)}MB file from S3 to ${tempFilePath}`);

  // Download using streaming (memory-safe)
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error("Empty file body from S3");
  }

  // Stream directly to disk, bypassing RAM
  const writeStream = createWriteStreamSync(tempFilePath);
  await pipeline(
    response.Body as NodeJS.ReadableStream,
    writeStream
  );

  console.log(`[STREAM] Download complete: ${tempFilePath}`);

  return tempFilePath;
}

// ============================================================================
// VIDEO CHUNKING (for very large video files)
// ============================================================================

/**
 * Split a large video into smaller chunks for processing.
 * Creates 10-minute chunks to stay well under Whisper's 25MB limit.
 *
 * @param videoBuffer - The video file as a Buffer
 * @param inputFileName - Original filename
 * @param chunkDurationSeconds - Duration of each chunk in seconds (default: 600 = 10 minutes)
 * @returns Array of chunk file paths
 */
async function chunkVideoFile(
  videoBuffer: Buffer,
  inputFileName: string,
  chunkDurationSeconds: number = 600
): Promise<string[]> {
  console.log(`[CHUNKING] Starting video chunking for ${inputFileName} (${Math.round(videoBuffer.length / 1024 / 1024)}MB)`);

  const tempId = randomUUID();
  const inputExt = inputFileName.split('.').pop()?.toLowerCase() || 'mp4';
  const inputPath = join(tmpdir(), `${tempId}-input.${inputExt}`);
  const outputPattern = join(tmpdir(), `${tempId}-chunk-%03d.${inputExt}`);

  try {
    // Write input video to temp file
    console.log("[CHUNKING] Writing video to temp file...");
    await writeFile(inputPath, videoBuffer);

    // Get video duration first
    const duration = await getVideoDuration(inputPath);
    console.log(`[CHUNKING] Video duration: ${Math.round(duration)} seconds`);

    if (duration <= chunkDurationSeconds) {
      // Video is short enough, return the original
      console.log("[CHUNKING] Video is short enough, no chunking needed");
      return [inputPath];
    }

    const numChunks = Math.ceil(duration / chunkDurationSeconds);
    console.log(`[CHUNKING] Splitting into ${numChunks} chunks of ${chunkDurationSeconds} seconds each`);

    // Use FFmpeg to split video into chunks with timeout
    const chunkingTimeout = 15 * 60 * 1000; // 15 minutes timeout for chunking

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            `-f segment`,
            `-segment_time ${chunkDurationSeconds}`,
            `-c copy`, // Stream copy for speed
            `-reset_timestamps 1`,
            `-avoid_negative_ts make_zero`
          ])
          .output(outputPattern)
          .on("start", (cmd) => {
            console.log("[CHUNKING] FFmpeg command:", cmd);
          })
          .on("progress", (progress) => {
            if (progress.percent) {
              console.log(`[CHUNKING] Progress: ${Math.round(progress.percent)}%`);
            }
          })
          .on("end", () => {
            console.log("[CHUNKING] Chunking complete");
            resolve();
          })
          .on("error", (err, stdout, stderr) => {
            console.error("[CHUNKING] Error:", err);
            console.error("[CHUNKING] Stdout:", stdout);
            console.error("[CHUNKING] Stderr:", stderr);
            reject(err);
          })
          .run();
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Chunking timed out after 15 minutes")), chunkingTimeout);
      })
    ]);

    // Collect all chunk file paths
    const chunkPaths: string[] = [];
    for (let i = 0; i < numChunks; i++) {
      const chunkPath = join(tmpdir(), `${tempId}-chunk-${String(i).padStart(3, '0')}.${inputExt}`);
      // Check if chunk file exists (last chunk might be shorter)
      try {
        await readFile(chunkPath); // This will throw if file doesn't exist
        chunkPaths.push(chunkPath);
        console.log(`[CHUNKING] Created chunk ${i + 1}/${numChunks}: ${chunkPath}`);
      } catch {
        console.log(`[CHUNKING] Chunk ${i + 1} does not exist (expected for short final chunk)`);
      }
    }

    console.log(`[CHUNKING] Successfully created ${chunkPaths.length} chunks`);
    return chunkPaths;

  } catch (error) {
    console.error("[CHUNKING] Video chunking failed:", error);
    throw new Error(`Failed to chunk video: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    // Clean up input file (chunks will be cleaned up by caller)
    try {
      await unlink(inputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get video duration using FFmpeg
 */
async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration || 0;
        resolve(duration);
      }
    });
  });
}

/**
 * Split a large audio file into smaller chunks for processing.
 * Creates chunks to stay under Whisper's 25MB limit.
 */
async function chunkAudioFile(
  audioBuffer: Buffer,
  inputFileName: string,
  chunkDurationSeconds: number = 600
): Promise<string[]> {
  console.log(`[CHUNKING] Starting audio chunking for ${inputFileName} (${Math.round(audioBuffer.length / 1024 / 1024)}MB)`);

  const tempId = randomUUID();
  const inputExt = inputFileName.split('.').pop()?.toLowerCase() || 'mp3';
  const inputPath = join(tmpdir(), `${tempId}-input.${inputExt}`);
  const outputPattern = join(tmpdir(), `${tempId}-chunk-%03d.${inputExt}`);

  try {
    // Write input audio to temp file
    console.log("[CHUNKING] Writing audio to temp file...");
    await writeFile(inputPath, audioBuffer);

    // Get audio duration
    const duration = await getVideoDuration(inputPath); // Same function works for audio
    console.log(`[CHUNKING] Audio duration: ${Math.round(duration)} seconds`);

    if (duration <= chunkDurationSeconds) {
      // Audio is short enough, return the original
      console.log("[CHUNKING] Audio is short enough, no chunking needed");
      return [inputPath];
    }

    const numChunks = Math.ceil(duration / chunkDurationSeconds);
    console.log(`[CHUNKING] Splitting into ${numChunks} chunks of ${chunkDurationSeconds} seconds each`);

    // Use FFmpeg to split audio into chunks
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          `-f segment`,
          `-segment_time ${chunkDurationSeconds}`,
          `-c copy`, // Stream copy for speed
          `-reset_timestamps 1`
        ])
        .output(outputPattern)
        .on("start", (cmd) => {
          console.log("[CHUNKING] FFmpeg command:", cmd);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            console.log(`[CHUNKING] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on("end", () => {
          console.log("[CHUNKING] Audio chunking complete");
          resolve();
        })
        .on("error", (err, stdout, stderr) => {
          console.error("[CHUNKING] Error:", err);
          console.error("[CHUNKING] Stdout:", stdout);
          console.error("[CHUNKING] Stderr:", stderr);
          reject(err);
        })
        .run();
    });

    // Collect all chunk file paths
    const chunkPaths: string[] = [];
    for (let i = 0; i < numChunks; i++) {
      const chunkPath = join(tmpdir(), `${tempId}-chunk-${String(i).padStart(3, '0')}.${inputExt}`);
      try {
        await readFile(chunkPath); // Check if file exists
        chunkPaths.push(chunkPath);
        console.log(`[CHUNKING] Created audio chunk ${i + 1}/${numChunks}: ${chunkPath}`);
      } catch {
        console.log(`[CHUNKING] Audio chunk ${i + 1} does not exist (expected for short final chunk)`);
      }
    }

    console.log(`[CHUNKING] Successfully created ${chunkPaths.length} audio chunks`);
    return chunkPaths;

  } catch (error) {
    console.error("[CHUNKING] Audio chunking failed:", error);
    throw new Error(`Failed to chunk audio: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    // Clean up input file
    try {
      await unlink(inputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract audio from first N seconds of a video file (fallback for very large files).
 * This is much faster than processing the entire video.
 */
async function extractAudioFromPortion(
  assetId: string,
  videoBuffer: Buffer,
  inputFileName: string,
  durationSeconds: number
): Promise<void> {
  console.log(`[FALLBACK] Extracting audio from first ${durationSeconds} seconds of ${inputFileName}`);

  const tempId = randomUUID();
  const inputExt = inputFileName.split('.').pop()?.toLowerCase() || 'mp4';
  const inputPath = join(tmpdir(), `${tempId}-input.${inputExt}`);
  const outputPath = join(tmpdir(), `${tempId}-audio.mp3`);

  try {
    // Write input video to temp file
    await writeFile(inputPath, videoBuffer);

    // Extract audio from first portion using FFmpeg with aggressive compression
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions([`-t ${durationSeconds}`]) // Only process first N seconds
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("32k")  // Aggressive: 32kbps for maximum compression
        .audioChannels(1)      // Mono
        .audioFrequency(16000) // 16kHz (Whisper native)
        .output(outputPath)
        .on("start", (cmd) => {
          console.log("[FALLBACK] FFmpeg command:", cmd);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            console.log(`[FALLBACK] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on("end", () => {
          console.log("[FALLBACK] Audio extraction from portion complete");
          resolve();
        })
        .on("error", (err, stdout, stderr) => {
          console.error("[FALLBACK] Error:", err);
          reject(err);
        })
        .run();
    });

    // Read the extracted audio and process it
    const audioBuffer = await readFile(outputPath);
    console.log(`[FALLBACK] Extracted audio file size: ${Math.round(audioBuffer.length / 1024)}KB`);

    // Create File object for Whisper
    const audioFileName = inputFileName.replace(/\.[^.]+$/, "_portion.mp3");
    const file = new File([new Uint8Array(audioBuffer)], audioFileName, {
      type: "audio/mpeg",
    });

    console.log(`[FALLBACK] Sending ${Math.round(audioBuffer.length / 1024)}KB audio portion to Whisper API`);

    // Process with Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: "en",
    });

    console.log(`[FALLBACK] Transcription complete. Processing ${transcription.segments?.length || 0} segments`);

    // Save segments to database (no timestamp adjustment needed since it's from the beginning)
    if (transcription.segments && transcription.segments.length > 0) {
      const transcriptSegments: Omit<TranscriptSegment, 'id' | 'createdAt'>[] = transcription.segments.map((segment: any) => ({
        assetId,
        text: segment.text.trim(),
        startTime: segment.start,
        endTime: segment.end,
        speaker: segment.speaker || null,
      }));

      // Verify transcriptSegment model exists in Prisma client
      if (!prisma.transcriptSegment) {
        throw new Error("Prisma client not properly generated. Please run: npx prisma generate");
      }

      await prisma.$transaction(async (tx) => {
        await tx.transcriptSegment.deleteMany({
          where: { assetId },
        });
        await tx.transcriptSegment.createMany({
          data: transcriptSegments,
        });
      });

      console.log(`[FALLBACK] Saved ${transcriptSegments.length} transcript segments from audio portion`);
    }

  } catch (error) {
    console.error("[FALLBACK] Audio portion extraction failed:", error);
    throw new Error(`Failed to extract audio from portion: ${error instanceof Error ? error.message : "Unknown error"}`);
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
// VIDEO COMPRESSION (for large video files)
// ============================================================================

/**
 * Automatically compress a large video file to reduce its size.
 * Uses FFmpeg with optimized settings for speech recognition.
 * 
 * @param videoBuffer - The video file as a Buffer
 * @param inputFileName - Original filename
 * @param targetSizeMB - Target size in MB (default: 20MB for Whisper API)
 * @returns Buffer containing compressed video
 */
async function compressVideo(
  videoBuffer: Buffer,
  inputFileName: string,
  targetSizeMB: number = 20
): Promise<Buffer> {
  console.log(`[COMPRESSION] Starting video compression for ${inputFileName} (${Math.round(videoBuffer.length / 1024 / 1024)}MB -> target: ${targetSizeMB}MB)`);

  const tempId = randomUUID();
  const inputExt = inputFileName.split('.').pop()?.toLowerCase() || 'mp4';
  const inputPath = join(tmpdir(), `${tempId}-input.${inputExt}`);
  const outputPath = join(tmpdir(), `${tempId}-compressed.mp4`);

  try {
    // Write input video to temp file
    console.log("[COMPRESSION] Writing video to temp file...");
    await writeFile(inputPath, videoBuffer);

    // Get video duration to estimate compression settings
    const duration = await getVideoDuration(inputPath);
    const currentSizeMB = videoBuffer.length / 1024 / 1024;
    const targetBitrate = Math.max(500, Math.floor((targetSizeMB * 8 * 1024) / duration)); // kbps, minimum 500kbps

    console.log(`[COMPRESSION] Video duration: ${Math.round(duration)}s, target bitrate: ${targetBitrate}kbps`);

    // Compress video using FFmpeg with aggressive settings
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec("libx264")
        .videoBitrate(`${targetBitrate}k`)
        .size("1280x?") // Scale down to 1280px width
        .fps(24) // Reduce frame rate to 24fps
        .audioCodec("aac")
        .audioBitrate("128k")
        .audioChannels(2)
        .outputOptions([
          "-preset fast", // Fast encoding
          "-crf 28", // Higher CRF for more compression
          "-movflags +faststart", // Web optimization
        ])
        .output(outputPath)
        .on("start", (cmd) => {
          console.log("[COMPRESSION] FFmpeg command:", cmd);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            console.log(`[COMPRESSION] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on("end", () => {
          console.log("[COMPRESSION] Compression complete");
          resolve();
        })
        .on("error", (err, stdout, stderr) => {
          console.error("[COMPRESSION] Error:", err);
          console.error("[COMPRESSION] Stdout:", stdout);
          console.error("[COMPRESSION] Stderr:", stderr);
          reject(err);
        })
        .run();
    });

    // Read compressed file
    const compressedBuffer = await readFile(outputPath);
    const compressedSizeMB = compressedBuffer.length / 1024 / 1024;
    const reductionPercent = Math.round((1 - compressedBuffer.length / videoBuffer.length) * 100);

    console.log(`[COMPRESSION] Compression complete: ${compressedSizeMB.toFixed(2)}MB (${reductionPercent}% reduction)`);

    // Check if we achieved target size
    if (compressedSizeMB > targetSizeMB * 1.5) {
      console.warn(`[COMPRESSION] Compressed size (${compressedSizeMB.toFixed(2)}MB) is still larger than target (${targetSizeMB}MB)`);
    }

    return compressedBuffer;

  } catch (error) {
    console.error("[COMPRESSION] Video compression failed:", error);
    throw new Error(`Failed to compress video: ${error instanceof Error ? error.message : "Unknown error"}`);
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
// AUDIO EXTRACTION (for large video files)
// ============================================================================

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

    // Extract audio using fluent-ffmpeg with aggressive compression
    // 32kbps mono MP3: A 1-hour video becomes ~14MB, fits under 25MB limit
    console.log("[FFMPEG] Extracting lightweight audio (32kbps mono)...");
    
    const extractionTimeout = 10 * 60 * 1000; // 10 minutes timeout for audio extraction
    
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .noVideo()
          .audioCodec("libmp3lame")
          .audioBitrate("32k")  // Aggressive: 32kbps instead of 64kbps
          .audioChannels(1)      // Mono (reduces size by 50%)
          .audioFrequency(16000) // 16kHz (Whisper's native sample rate)
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
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Audio extraction timed out after 10 minutes")), extractionTimeout);
      })
    ]);

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

/**
 * Process a video file and create transcript segments with timestamps.
 * Uses Whisper API with verbose_json response format and segment timestamps.
 *
 * @param assetId - The asset ID to associate segments with
 * @param fileBuffer - The video/audio file buffer
 * @param fileName - Original filename for format detection
 * @param fileType - MIME type of the file
 * @returns Promise<void>
 */
export async function processVideo(
  assetId: string,
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
): Promise<void> {
  try {
    console.log(`[VIDEO_TRANSCRIBER] Starting transcription for asset ${assetId}: ${fileName} (${fileType})`);

    // Handle large files with multiple strategies
    let audioBuffer = fileBuffer;
    let audioFileName = fileName;
    let extractedAudio = false;
    let isChunked = false;
    let chunkPaths: string[] = [];
    let compressedVideo = false;

    // Check if file is too large and needs special handling
    if (fileBuffer.length > MAX_WHISPER_FILE_SIZE) {
      console.log(`[VIDEO_TRANSCRIBER] File is ${Math.round(fileBuffer.length / 1024 / 1024)}MB, exceeds 25MB limit`);

      // Check if it's absurdly large
      if (fileBuffer.length > MAX_PROCESSABLE_SIZE) {
        throw new Error(
          `File too large (${Math.round(fileBuffer.length / 1024 / 1024)}MB). ` +
          `Maximum processable size is 500MB. Please compress the video first.`
        );
      }

      // Strategy 1: Try aggressive audio extraction first (FASTEST - 32kbps mono)
      // Skip full extraction for very large files (>200MB) - go straight to first 10 minutes
      if (fileType.startsWith("video/")) {
        const fileSizeMB = fileBuffer.length / 1024 / 1024;
        
        if (fileSizeMB > 200) {
          console.log(`[VIDEO_TRANSCRIBER] Video is very large (${Math.round(fileSizeMB)}MB), skipping full audio extraction. Using first 10 minutes strategy instead.`);
          // Skip to Strategy 2 (first 10 minutes)
        } else {
          console.log("[VIDEO_TRANSCRIBER] Strategy 1: Extracting lightweight audio (32kbps mono)...");
          try {
            audioBuffer = await extractAudioFromVideo(fileBuffer, fileName);
            audioFileName = fileName.replace(/\.[^.]+$/, ".mp3");
            extractedAudio = true;

            // Check if extracted audio is still too large
            if (audioBuffer.length > MAX_WHISPER_FILE_SIZE) {
              console.log("[VIDEO_TRANSCRIBER] Audio still too large after 32kbps extraction, trying first 10 minutes only...");
              // Fall through to Strategy 2
              throw new Error("Audio extraction resulted in file still too large for Whisper API");
            }

            console.log(`[VIDEO_TRANSCRIBER] Audio extraction successful: ${Math.round(audioBuffer.length / 1024)}KB`);
          } catch (extractionError) {
            console.warn("[VIDEO_TRANSCRIBER] Audio extraction failed, trying first 10 minutes fallback:", extractionError);
            // Fall through to Strategy 2
          }
        }

        // Strategy 2: Try extracting audio from first portion only (faster, more reliable)
        // This is the recommended approach for very large files
        if (!extractedAudio) {
          console.log("[VIDEO_TRANSCRIBER] Strategy 2: Extracting audio from first 10 minutes only (fast fallback)...");
          try {
            // Extract audio from first 10 minutes only - this is much more reliable
            await extractAudioFromPortion(assetId, fileBuffer, fileName, 10 * 60); // 10 minutes
            console.log("[VIDEO_TRANSCRIBER] Successfully processed first 10 minutes of video");
            return; // Success, audio extracted from portion
          } catch (portionError) {
            console.warn("[VIDEO_TRANSCRIBER] First 10 minutes extraction failed, trying full chunking:", portionError);

            // Strategy 3: Chunk the video into smaller pieces
            console.log("[VIDEO_TRANSCRIBER] Strategy 3: Chunking video into smaller segments...");
            try {
              // For very large files, try smaller chunks first
              const chunkDuration = fileBuffer.length > 200 * 1024 * 1024 ? 300 : 600; // 5 min for >200MB, 10 min otherwise
              console.log(`[VIDEO_TRANSCRIBER] Using ${chunkDuration}-second chunks for large file`);

              chunkPaths = await chunkVideoFile(fileBuffer, fileName, chunkDuration);
              isChunked = true;
              console.log(`[VIDEO_TRANSCRIBER] Video chunking successful: ${chunkPaths.length} chunks created`);
            } catch (chunkingError) {
              console.error("[VIDEO_TRANSCRIBER] All automatic strategies failed:", chunkingError);

              // Provide clear guidance when all strategies fail
              const fileSizeMB = Math.round(fileBuffer.length / 1024 / 1024);
              const errorMessage = `Unable to process large video (${fileSizeMB}MB). All automatic strategies failed.\n\n` +
                `The app tried:\n` +
                `1. Aggressive audio extraction (32kbps mono MP3)\n` +
                `2. First 10 minutes only fallback\n` +
                `3. Video chunking\n\n` +
                `RECOMMENDED FIX - Extract first 10 minutes as audio:\n` +
                `ffmpeg -i input.mp4 -t 600 -vn -acodec libmp3lame -ab 32k -ac 1 -ar 16000 first_10min.mp3\n\n` +
                `This creates a ~5MB file that processes in 1-2 minutes.\n\n` +
                `OR compress the full video:\n` +
                `• HandBrake (free): https://handbrake.fr/\n` +
                `• FFmpeg: ffmpeg -i input.mp4 -vf scale=1280:-1 -c:v libx264 -crf 28 -c:a aac -b:a 128k output.mp4\n` +
                `Target: under 25MB for instant processing`;

              throw new Error(errorMessage);
            }
          }
        }
      } else {
        // Strategy for large audio files: try chunking
        console.log("[VIDEO_TRANSCRIBER] Strategy: Chunking large audio file...");
        try {
          // For audio files, we can chunk directly without video processing
          chunkPaths = await chunkAudioFile(fileBuffer, fileName, 600); // 10-minute chunks
          isChunked = true;
          console.log(`[VIDEO_TRANSCRIBER] Audio chunking successful: ${chunkPaths.length} chunks created`);
        } catch (chunkingError) {
          console.error("[VIDEO_TRANSCRIBER] Audio chunking failed:", chunkingError);

          throw new Error(
            `Audio file too large (${Math.round(fileBuffer.length / 1024 / 1024)}MB). ` +
            `Maximum size is 25MB. Please compress using:\n` +
            `• FFmpeg: ffmpeg -i input.wav -acodec libmp3lame -ab 64k output.mp3\n` +
            `• Audacity or similar audio editing software`
          );
        }
      }
    }

    // Process chunks if video was chunked
    if (isChunked && chunkPaths.length > 0) {
      console.log(`[VIDEO_TRANSCRIBER] Processing ${chunkPaths.length} chunks...`);
      const allSegments: any[] = [];
      const maxChunksToProcess = Math.min(chunkPaths.length, 10); // Limit to first 10 chunks for safety

      // Only process a reasonable number of chunks to avoid timeouts
      const chunksToProcess = chunkPaths.slice(0, maxChunksToProcess);

      if (chunksToProcess.length < chunkPaths.length) {
        console.warn(`[VIDEO_TRANSCRIBER] Limiting processing to first ${maxChunksToProcess} chunks out of ${chunkPaths.length} to avoid timeouts`);
      }

      for (let i = 0; i < chunksToProcess.length; i++) {
        const chunkPath = chunkPaths[i];
        console.log(`[VIDEO_TRANSCRIBER] Processing chunk ${i + 1}/${chunkPaths.length}`);

        try {
          // Read chunk file
          const chunkBuffer = await readFile(chunkPath);
          const chunkFileName = `${fileName}_chunk_${i + 1}.mp4`;

          // Create File object for Whisper
          const chunkMimeType = extractedAudio ? "audio/mpeg" : getMimeType(chunkFileName);
          const chunkFile = new File([new Uint8Array(chunkBuffer)], chunkFileName, {
            type: chunkMimeType,
          });

          // Process chunk with Whisper
          const chunkTranscription = await openai.audio.transcriptions.create({
            file: chunkFile,
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["segment"],
            language: "en",
          });

          // Adjust timestamps for this chunk
          if (chunkTranscription.segments) {
            const timeOffset = i * 600; // 10 minutes per chunk
            chunkTranscription.segments.forEach((segment: any) => {
              segment.start += timeOffset;
              segment.end += timeOffset;
            });
            allSegments.push(...chunkTranscription.segments);
          }

          console.log(`[VIDEO_TRANSCRIBER] Chunk ${i + 1} processed: ${chunkTranscription.segments?.length || 0} segments`);
        } finally {
          // Clean up chunk file
          try {
            await unlink(chunkPath).catch(() => {});
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      console.log(`[VIDEO_TRANSCRIBER] All chunks processed. Total segments: ${allSegments.length}`);

      // Save combined segments to database
      if (allSegments.length > 0) {
        const transcriptSegments: Omit<TranscriptSegment, 'id' | 'createdAt'>[] = allSegments.map((segment: any) => ({
          assetId,
          text: segment.text.trim(),
          startTime: segment.start,
          endTime: segment.end,
          speaker: segment.speaker || null,
        }));

        await prisma.$transaction(async (tx) => {
          await tx.transcriptSegment.deleteMany({
            where: { assetId },
          });
          await tx.transcriptSegment.createMany({
            data: transcriptSegments,
          });
        });

        console.log(`[VIDEO_TRANSCRIBER] Saved ${transcriptSegments.length} transcript segments for chunked video ${assetId}`);
      }

      return; // Done processing chunks
    }

    // Create a File object for Whisper API
    const mimeType = extractedAudio ? "audio/mpeg" : getMimeType(audioFileName);
    const file = new File([new Uint8Array(audioBuffer)], audioFileName, {
      type: mimeType,
    });

    console.log(`[VIDEO_TRANSCRIBER] Sending to Whisper API: ${audioFileName} (${Math.round(audioBuffer.length / 1024)}KB, type: ${mimeType})`);

    // Call Whisper API with verbose_json and segment timestamps
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: "en", // Can be made configurable
    });

    console.log(`[VIDEO_TRANSCRIBER] Transcription complete. Processing ${transcription.segments?.length || 0} segments...`);

    // Process the segments and save to database
    if (transcription.segments && transcription.segments.length > 0) {
      const transcriptSegments: Omit<TranscriptSegment, 'id' | 'createdAt'>[] = transcription.segments.map((segment: any) => ({
        assetId,
        text: segment.text.trim(),
        startTime: segment.start,
        endTime: segment.end,
        speaker: segment.speaker || null, // Speaker identification if available
      }));

      // Save all segments in a transaction
      await prisma.$transaction(async (tx) => {
        // First, delete any existing segments for this asset (in case of re-processing)
        await tx.transcriptSegment.deleteMany({
          where: { assetId },
        });

        // Insert new segments
        await tx.transcriptSegment.createMany({
          data: transcriptSegments,
        });
      });

      console.log(`[VIDEO_TRANSCRIBER] Saved ${transcriptSegments.length} transcript segments for asset ${assetId}`);
    } else {
      console.warn(`[VIDEO_TRANSCRIBER] No segments found in transcription response for asset ${assetId}`);
    }

  } catch (error) {
    console.error(`[VIDEO_TRANSCRIBER] Error processing video for asset ${assetId}:`, error);
    throw error;
  }
}

/**
 * Process only a portion of a video from S3 URL (faster, more reliable for large files)
 */
export async function processVideoFromS3Portion(
  assetId: string,
  s3Url: string,
  fileName: string,
  fileType: string,
  durationSeconds: number
): Promise<void> {
  const tempFilePath = join(tmpdir(), `${assetId}-portion-${randomUUID()}.mp4`);
  
  try {
    console.log(`[VIDEO_TRANSCRIBER] Processing first ${durationSeconds} seconds from S3 for asset ${assetId}`);

    const key = extractKeyFromS3Url(s3Url);
    if (!key) {
      throw new Error("Could not extract key from S3 URL");
    }

    // Stream download to disk (memory-safe)
    await streamS3ToDisk(key, tempFilePath);

    // Read file into buffer for processing
    const fileBuffer = await readFile(tempFilePath);
    console.log(`[VIDEO_TRANSCRIBER] File loaded: ${Math.round(fileBuffer.length / 1024 / 1024)}MB`);

    // Extract audio from first portion only
    await extractAudioFromPortion(assetId, fileBuffer, fileName, durationSeconds);

  } catch (error) {
    console.error(`[VIDEO_TRANSCRIBER] Error processing video portion from S3 for asset ${assetId}:`, error);
    throw error;
  } finally {
    // Always cleanup temp file
    try {
      await unlink(tempFilePath);
      console.log(`[STREAM] Cleaned up temp file: ${tempFilePath}`);
    } catch (cleanupError) {
      console.warn(`[STREAM] Failed to cleanup temp file ${tempFilePath}:`, cleanupError);
    }
  }
}

/**
 * Process a video from S3 URL
 * Downloads the file from S3 and processes it
 */
export async function processVideoFromS3(
  assetId: string,
  s3Url: string,
  fileName: string,
  fileType: string
): Promise<void> {
  const tempFilePath = join(tmpdir(), `${assetId}-${randomUUID()}.mp4`);
  
  try {
    console.log(`[VIDEO_TRANSCRIBER] Starting processing for asset ${assetId}`);

    // Check if segments already exist - skip if they do
    const existingSegments = await prisma.transcriptSegment.count({
      where: { assetId },
    });

    if (existingSegments > 0) {
      console.log(`[VIDEO_TRANSCRIBER] Segments already exist for asset ${assetId} (${existingSegments} segments). Skipping processing.`);
      return;
    }

    console.log(`[VIDEO_TRANSCRIBER] Downloading video from S3 for asset ${assetId}`);

    const key = extractKeyFromS3Url(s3Url);
    if (!key) {
      throw new Error("Could not extract key from S3 URL");
    }

    // Stream download to disk (memory-safe)
    await streamS3ToDisk(key, tempFilePath);

    // Read file into buffer for processing (we'll optimize this later if needed)
    const fileBuffer = await readFile(tempFilePath);
    console.log(`[VIDEO_TRANSCRIBER] File loaded: ${Math.round(fileBuffer.length / 1024 / 1024)}MB`);

    // Process the video
    await processVideo(assetId, fileBuffer, fileName, fileType);

  } catch (error) {
    console.error(`[VIDEO_TRANSCRIBER] Error downloading/processing video from S3 for asset ${assetId}:`, error);
    throw error;
  } finally {
    // Always cleanup temp file
    try {
      await unlink(tempFilePath);
      console.log(`[STREAM] Cleaned up temp file: ${tempFilePath}`);
    } catch (cleanupError) {
      console.warn(`[STREAM] Failed to cleanup temp file ${tempFilePath}:`, cleanupError);
    }
  }
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

/**
 * Get transcript segments for an asset
 */
export async function getTranscriptSegments(assetId: string): Promise<TranscriptSegment[]> {
  try {
    const segments = await prisma.transcriptSegment.findMany({
      where: { assetId },
      orderBy: { startTime: 'asc' },
    });

    // Convert Date to string for type compatibility
    return segments.map(segment => ({
      ...segment,
      createdAt: segment.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error(`[VIDEO_TRANSCRIBER] Error fetching transcript segments for asset ${assetId}:`, error);
    throw error;
  }
}