// Shared types that match the Prisma schema
export type FunnelStage = 
  | "TOFU_AWARENESS"
  | "MOFU_CONSIDERATION"
  | "BOFU_DECISION"
  | "RETENTION";

export type AssetStatus = 
  | "PENDING"
  | "PROCESSING"
  | "PROCESSED"
  | "APPROVED"
  | "ERROR";

export interface ProductLine {
  id: string;
  name: string;
  description: string;
  valueProposition: string;
  specificICP: string[]; // Target ICP roles for this product line
}

export interface Asset {
  id: string;
  createdAt: string;
  updatedAt?: string;
  title: string;
  s3Url: string;
  s3Key?: string; // S3 object key (source of truth for S3 location)
  fileType: string;
  assetType?: string | null; // Marketing asset type (e.g., "Case Study", "Whitepaper") - distinct from technical fileType
  extractedText: string | null;
  funnelStage: FunnelStage;
  icpTargets: string[];
  painClusters: string[];
  outreachTip: string;
  status: AssetStatus;
  customCreatedAt?: string | null;
  lastReviewedAt?: string | null;
  contentQualityScore?: number | null;
  expiryDate?: string | null;
  atomicSnippets?: any;
  // AI traceability fields
  aiModel?: string | null;
  promptVersion?: string | null;
  analyzedAt?: string | null;
  aiConfidence?: number | null;
  dominantColor?: string | null; // Dominant color hex code (e.g., "#FF5733")
  inUse?: boolean; // Whether the asset is currently being used
  // Upload tracking
  uploadedBy?: { id: string; name: string | null; } | null; // User who uploaded the asset
  uploadedByNameOverride?: string | null; // Custom name override for uploader
  // Product lines relation (many-to-many)
  productLines?: ProductLine[]; // Product/Service lines this asset belongs to
}

export interface TranscriptSegment {
  id: string;
  assetId: string;
  text: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  speaker?: string | null;
  createdAt: string;
}

export interface TranscriptionJob {
  id: string;
  assetId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  error?: string | null;
  progress?: number | null; // 0-100
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}
