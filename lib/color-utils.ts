import ColorThief from "colorthief";
import { createCanvas, loadImage } from "canvas";
import { extractKeyFromS3Url, getPresignedDownloadUrl } from "./s3";

/**
 * Extract the dominant color from an image
 * @param imageUrl - The S3 URL or presigned URL of the image
 * @returns Hex color code (e.g., "#FF5733") or null if extraction fails
 */
export async function extractDominantColor(imageUrl: string): Promise<string | null> {
  try {
    // Check if the URL is an image
    if (!imageUrl || (!imageUrl.includes("image/") && !imageUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
      return null;
    }

    // Extract S3 key and get presigned URL if needed
    const key = extractKeyFromS3Url(imageUrl);
    let imageUrlToFetch = imageUrl;
    
    if (key) {
      // Get a presigned URL for downloading the image
      imageUrlToFetch = await getPresignedDownloadUrl(key, 3600);
    }

    // Fetch the image
    const response = await fetch(imageUrlToFetch);
    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.statusText}`);
      return null;
    }

    // Convert response to buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Load image using canvas
    const img = await loadImage(buffer);
    
    // Create a canvas and draw the image
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    
    // Use ColorThief to get the dominant color
    // ColorThief can work with the canvas element directly
    const colorThief = new ColorThief();
    const rgb = colorThief.getColor(canvas as any);

    if (!rgb || !Array.isArray(rgb) || rgb.length !== 3) {
      return null;
    }

    // Convert RGB to Hex (ensure values are in 0-255 range)
    const [r, g, b] = rgb.map((val) => Math.max(0, Math.min(255, val)));
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();

    return hex;
  } catch (error) {
    console.error("Error extracting dominant color:", error);
    // Return null on any error (e.g., transparent PNG, unsupported format, etc.)
    return null;
  }
}
