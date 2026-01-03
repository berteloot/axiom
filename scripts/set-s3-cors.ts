import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, "utf-8");
    envFile.split("\n").forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith("#")) {
        const [key, ...valueParts] = trimmedLine.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, ""); // Remove quotes
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
}

loadEnvFile();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

async function setCorsConfiguration() {
  if (!BUCKET_NAME) {
    console.error("❌ AWS_S3_BUCKET_NAME environment variable is required");
    process.exit(1);
  }

  try {
    // First, check if CORS is already configured
    try {
      const getCorsCommand = new GetBucketCorsCommand({
        Bucket: BUCKET_NAME,
      });
      const existingCors = await s3Client.send(getCorsCommand);
      console.log("📋 Current CORS configuration:", JSON.stringify(existingCors.CORSRules, null, 2));
    } catch (error: any) {
      if (error.name !== "NoSuchCORSConfiguration") {
        throw error;
      }
      console.log("ℹ️  No existing CORS configuration found");
    }

    // Set CORS configuration
    console.log(`\n🔧 Setting CORS configuration for bucket: ${BUCKET_NAME}...`);

    const corsConfiguration = {
      CORSRules: [
        {
          AllowedOrigins: [
            "http://localhost:3000",
            "http://localhost:3001",
            "https://localhost:3000",
            // Add your production domain here when ready
            // "https://yourdomain.com",
          ],
          AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
          AllowedHeaders: [
            "*",
            "Content-Type",
            "Content-MD5",
            "x-amz-content-sha256",
            "x-amz-date",
            "x-amz-security-token",
            "x-amz-user-agent",
            "x-amz-acl",
            "x-amz-checksum-crc32",
            "x-amz-sdk-checksum-algorithm",
          ],
          ExposeHeaders: [
            "ETag",
            "x-amz-server-side-encryption",
            "x-amz-request-id",
            "x-amz-id-2",
          ],
          MaxAgeSeconds: 3000,
        },
      ],
    };

    const putCorsCommand = new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: corsConfiguration,
    });

    await s3Client.send(putCorsCommand);
    console.log("✅ CORS configuration set successfully!");

    // Verify the configuration
    console.log("\n🔍 Verifying CORS configuration...");
    const verifyCommand = new GetBucketCorsCommand({
      Bucket: BUCKET_NAME,
    });
    const verifiedCors = await s3Client.send(verifyCommand);
    console.log("✅ Verified CORS configuration:", JSON.stringify(verifiedCors.CORSRules, null, 2));

    console.log("\n🎉 CORS setup complete!");
    console.log("\n💡 Note: If you're still experiencing CORS issues:");
    console.log("   1. Make sure your bucket name in .env matches the actual bucket name");
    console.log("   2. Wait a few seconds for the CORS configuration to propagate");
    console.log("   3. Clear your browser cache and try again");
    console.log("   4. Check that your bucket region matches AWS_REGION in .env");
  } catch (error: any) {
    console.error("❌ Error setting CORS configuration:", error.message);
    if (error.name === "AccessDenied") {
      console.error("\n💡 Make sure your AWS credentials have s3:PutBucketCors permission");
    }
    process.exit(1);
  }
}

setCorsConfiguration();
