import { createCanvas, loadImage } from "canvas";
import { extractKeyFromS3Url, getPresignedDownloadUrl } from "./s3";

/**
 * Extract the dominant color from an image using server-side canvas
 * Uses ImageData to sample pixels and find the most common color
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
    
    // Resize to a smaller size for performance (max 200px on longest side)
    const maxSize = 200;
    let width = img.width;
    let height = img.height;
    if (width > height) {
      if (width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      }
    } else {
      if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
    }
    
    // Create a canvas and draw the resized image
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Sample pixels (every 10th pixel for performance)
    const colorCounts: { [key: string]: number } = {};
    const sampleStep = 10;
    
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      // Skip transparent pixels
      if (a < 128) continue;
      
      // Quantize colors to reduce noise (round to nearest 16)
      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      
      const colorKey = `${qr},${qg},${qb}`;
      colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
    }
    
    // Find the most common color
    let maxCount = 0;
    let dominantColor = null;
    
    for (const [colorKey, count] of Object.entries(colorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantColor = colorKey;
      }
    }
    
    if (!dominantColor) {
      return null;
    }
    
    // Convert to hex
    const [r, g, b] = dominantColor.split(",").map(Number);
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();

    return hex;
  } catch (error) {
    console.error("Error extracting dominant color:", error);
    // Return null on any error (e.g., transparent PNG, unsupported format, etc.)
    return null;
  }
}
