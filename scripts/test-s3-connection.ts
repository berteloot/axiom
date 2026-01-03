/**
 * S3 Connection Test Script
 * Tests the S3 bucket connection and basic operations
 */

import { S3Client, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, "green");
}

function logError(message: string) {
  log(`❌ ${message}`, "red");
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, "blue");
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, "yellow");
}

async function testConnection() {
  console.log("\n" + "=".repeat(60));
  log("S3 Connection Test", "blue");
  console.log("=".repeat(60) + "\n");

  // Check environment variables
  logInfo("Checking environment variables...");
  if (!process.env.AWS_REGION) {
    logError("AWS_REGION is not set");
    return false;
  }
  if (!process.env.AWS_ACCESS_KEY_ID) {
    logError("AWS_ACCESS_KEY_ID is not set");
    return false;
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    logError("AWS_SECRET_ACCESS_KEY is not set");
    return false;
  }
  if (!BUCKET_NAME) {
    logError("AWS_S3_BUCKET_NAME is not set");
    return false;
  }

  logSuccess("All environment variables are set");
  logInfo(`Region: ${process.env.AWS_REGION}`);
  logInfo(`Bucket: ${BUCKET_NAME}`);
  console.log();

  let allTestsPassed = true;

  // Test 1: Check if bucket exists and is accessible
  try {
    logInfo("Test 1: Checking bucket access...");
    const headCommand = new HeadBucketCommand({ Bucket: BUCKET_NAME });
    await s3Client.send(headCommand);
    logSuccess(`Bucket "${BUCKET_NAME}" exists and is accessible`);
  } catch (error: any) {
    allTestsPassed = false;
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      logError(`Bucket "${BUCKET_NAME}" does not exist`);
    } else if (error.name === "Forbidden" || error.$metadata?.httpStatusCode === 403) {
      logError(`Access denied to bucket "${BUCKET_NAME}". Check your credentials and permissions.`);
    } else {
      logError(`Failed to access bucket: ${error.message}`);
    }
    return false;
  }

  // Test 2: List objects in bucket
  try {
    logInfo("Test 2: Listing objects in bucket...");
    const listCommand = new ListObjectsV2Command({ Bucket: BUCKET_NAME, MaxKeys: 10 });
    const listResponse = await s3Client.send(listCommand);
    const objectCount = listResponse.Contents?.length || 0;
    if (objectCount > 0) {
      logSuccess(`Found ${objectCount} object(s) in bucket`);
      if (listResponse.Contents) {
        console.log("  Objects:");
        listResponse.Contents.slice(0, 5).forEach((obj) => {
          console.log(`    - ${obj.Key} (${(obj.Size || 0).toLocaleString()} bytes)`);
        });
        if (objectCount > 5) {
          console.log(`    ... and ${objectCount - 5} more`);
        }
      }
    } else {
      logWarning("Bucket is empty (no objects found)");
    }
  } catch (error: any) {
    allTestsPassed = false;
    logError(`Failed to list objects: ${error.message}`);
  }

  // Test 3: Generate presigned upload URL
  try {
    logInfo("Test 3: Generating presigned upload URL...");
    const testKey = `test/connection-test-${Date.now()}.txt`;
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testKey,
      ContentType: "text/plain",
    });
    const presignedUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });
    logSuccess("Presigned upload URL generated successfully");
    logInfo(`Test key: ${testKey}`);
    logInfo(`URL expires in: 3600 seconds (1 hour)`);
  } catch (error: any) {
    allTestsPassed = false;
    logError(`Failed to generate presigned URL: ${error.message}`);
  }

  // Test 4: Upload a test file
  try {
    logInfo("Test 4: Uploading test file...");
    const testKey = `test/connection-test-${Date.now()}.txt`;
    const testContent = `S3 Connection Test File\nCreated: ${new Date().toISOString()}\nBucket: ${BUCKET_NAME}\nRegion: ${process.env.AWS_REGION}`;
    
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testKey,
      Body: testContent,
      ContentType: "text/plain",
    });

    await s3Client.send(putCommand);
    logSuccess(`Test file uploaded successfully: ${testKey}`);

    // Test 5: Delete the test file
    try {
      logInfo("Test 5: Deleting test file...");
      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: testKey,
      });
      await s3Client.send(deleteCommand);
      logSuccess("Test file deleted successfully");
    } catch (error: any) {
      logWarning(`Failed to delete test file: ${error.message}`);
      logWarning(`You may need to manually delete: ${testKey}`);
    }
  } catch (error: any) {
    allTestsPassed = false;
    logError(`Failed to upload test file: ${error.message}`);
    if (error.name === "AccessDenied" || error.$metadata?.httpStatusCode === 403) {
      logWarning("Check that your IAM user has s3:PutObject permission");
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  if (allTestsPassed) {
    logSuccess("All tests passed! S3 connection is working correctly.");
  } else {
    logError("Some tests failed. Please check the errors above.");
  }
  console.log("=".repeat(60) + "\n");

  return allTestsPassed;
}

// Run the test
testConnection()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
