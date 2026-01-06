import { z } from "zod";

// Allowed file types for upload
const ALLOWED_FILE_TYPES = [
  // Documents
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/msword", // DOC
  "application/vnd.ms-excel", // XLS
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
  "text/csv",
  "text/plain",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Video (Audio-First analysis)
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/webm",
  "video/mpeg",
  "video/x-m4v",
  // Audio
  "audio/mpeg", // .mp3
  "audio/mp4",  // .m4a
  "audio/wav",
  "audio/ogg",
  "audio/flac",
] as const;

// Allowed file extensions
const ALLOWED_EXTENSIONS = [
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt",
  // Images
  "jpg", "jpeg", "png", "gif", "webp", "svg",
  // Video
  "mp4", "mov", "avi", "webm", "mpeg", "mpg", "m4v",
  // Audio
  "mp3", "m4a", "wav", "ogg", "flac",
] as const;

/**
 * Validation schema for presigned upload URL request
 */
export const presignedUploadSchema = z.object({
  fileName: z.string()
    .min(1, "File name is required")
    .max(255, "File name too long")
    .refine((name) => {
      const ext = name.split(".").pop()?.toLowerCase();
      return ext && ALLOWED_EXTENSIONS.includes(ext as any);
    }, "File type not allowed"),
  fileType: z.string()
    .refine((type) => ALLOWED_FILE_TYPES.includes(type as any), {
      message: "File type not allowed"
    }),
});

/**
 * Validation schema for asset processing request
 */
export const processAssetSchema = z.object({
  key: z.string()
    .min(1, "S3 key is required")
    .max(1024, "S3 key too long"),
  title: z.string()
    .optional(),
  fileType: z.string()
    .min(1, "File type is required")
    .refine((type) => ALLOWED_FILE_TYPES.includes(type as any), {
      message: "File type not allowed"
    }),
});

/**
 * Validation schema for asset PATCH request
 */
export const updateAssetSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  assetType: z.string().nullable().optional(),
  extractedText: z.string().optional(),
  funnelStage: z.enum([
    "TOFU_AWARENESS",
    "MOFU_CONSIDERATION",
    "BOFU_DECISION",
    "RETENTION"
  ]).optional(),
  icpTargets: z.array(z.string().max(100)).optional(),
  painClusters: z.array(z.string().max(100))
    .max(3, "Maximum 3 pain clusters allowed")
    .optional(),
  outreachTip: z.string().max(2000).optional(),
  productLineIds: z.array(z.string()).optional(), // Array of product line IDs
  status: z.enum([
    "PENDING",
    "PROCESSING",
    "PROCESSED",
    "APPROVED",
    "ERROR"
  ]).optional(),
  customCreatedAt: z.string().datetime().nullable().optional(),
  lastReviewedAt: z.string().datetime().nullable().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
});

/**
 * Validation schema for invitation request
 */
export const inviteMemberSchema = z.object({
  email: z.string()
    .email("Valid email address is required")
    .min(1, "Email is required"),
  role: z.enum(["MEMBER", "ADMIN"])
    .default("MEMBER")
    .optional(),
});

/**
 * Validation schema for bulk invitation request (multiple accounts)
 */
export const bulkInviteMemberSchema = z.object({
  email: z.string()
    .email("Valid email address is required")
    .min(1, "Email is required"),
  accountIds: z.array(z.string())
    .min(1, "At least one account must be selected"),
  role: z.enum(["MEMBER", "ADMIN"])
    .default("MEMBER")
    .optional(),
});
