import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import mammoth from "mammoth";
import { extractKeyFromS3Url } from "./s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

/**
 * Extract text from a file stored in S3
 * Supports: PDF, DOCX, TXT
 */
export async function extractTextFromS3(
  s3Url: string,
  fileType: string
): Promise<string> {
  try {
    const key = extractKeyFromS3Url(s3Url);
    if (!key) {
      throw new Error("Could not extract key from S3 URL");
    }

    // Download file from S3
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
    
    const buffer = Buffer.concat(chunks);

    // Extract text based on file type
    if (fileType === "application/pdf") {
      // Use unpdf which is serverless-friendly
      try {
        const { extractText } = await import("unpdf");
        
        // Convert Buffer to Uint8Array as required by unpdf
        const uint8Array = new Uint8Array(buffer);
        const { text, totalPages } = await extractText(uint8Array);
        
        // unpdf returns text as an array of strings (one per page)
        // Inject page markers so AI can detect page numbers in snippets
        let finalText: string;
        if (Array.isArray(text)) {
          // Inject [PAGE_BREAK_N] markers between pages for AI page detection
          finalText = text
            .map((pageText, index) => {
              const pageNum = index + 1;
              return `[PAGE_BREAK_${pageNum}]\n${pageText}`;
            })
            .join('\n\n');
        } else {
          // Single page or non-array response - no page markers needed
          finalText = text;
        }
        
        if (!finalText || finalText.trim().length === 0) {
          throw new Error("No text content found in PDF");
        }
        
        console.log(`PDF parsed successfully: ${totalPages} pages, ${finalText.length} chars`);
        return finalText;
      } catch (pdfError) {
        console.error("PDF extraction failed:", pdfError);
        // If PDF extraction fails, throw a specific error
        throw new Error("PDF text extraction failed. The PDF may be image-based (scanned) or encrypted.");
      }
    } else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      // DOCX
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (fileType === "text/plain" || fileType.startsWith("text/")) {
      // Plain text
      return buffer.toString("utf-8");
    } else {
      // For other types, try to extract as text
      return buffer.toString("utf-8");
    }
  } catch (error) {
    console.error("Error extracting text from S3:", error);
    throw error;
  }
}
