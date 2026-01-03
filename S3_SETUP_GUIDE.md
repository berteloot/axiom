# S3 Bucket Setup Guide

This guide will walk you through creating an S3 bucket for the Asset Organizer application.

## Prerequisites

1. **AWS Account**: You need an active AWS account
2. **AWS CLI** (optional, for Method 1): Install from [AWS CLI Documentation](https://aws.amazon.com/cli/)
3. **AWS Credentials**: Access Key ID and Secret Access Key with appropriate permissions

## Method 1: Using AWS CLI (Recommended for Development)

### Step 1: Install AWS CLI

If you haven't installed AWS CLI:

```bash
# macOS (using Homebrew)
brew install awscli

# Or download from: https://aws.amazon.com/cli/
```

### Step 2: Configure AWS Credentials

```bash
aws configure
```

You'll be prompted for:
- AWS Access Key ID
- AWS Secret Access Key
- Default region name (e.g., `us-east-1`)
- Default output format (press Enter for default JSON)

### Step 3: Create the S3 Bucket

```bash
# Replace 'your-bucket-name' with your desired bucket name
# Bucket names must be globally unique across all AWS accounts
BUCKET_NAME="asset-organizer-$(date +%s)"  # Example: asset-organizer-1234567890
REGION="us-east-1"  # Choose your preferred region

# Create the bucket
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION

# If creating in us-east-1, use this simpler command instead:
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region us-east-1
```

**Note**: S3 bucket names must:
- Be 3-63 characters long
- Contain only lowercase letters, numbers, dots (.), and hyphens (-)
- Begin and end with a letter or number
- Be globally unique (not just unique to your account)

### Step 4: Configure Bucket Settings (Recommended)

#### Enable Versioning (Optional but recommended)
```bash
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled
```

#### Block Public Access (Recommended for security)
```bash
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

#### Set CORS Configuration (If needed for direct browser uploads)
```bash
# Create a CORS configuration file
cat > cors-config.json << EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

# Apply CORS configuration
aws s3api put-bucket-cors \
  --bucket $BUCKET_NAME \
  --cors-configuration file://cors-config.json
```

### Step 5: Update Environment Variables

Update your `.env` file with the bucket name and region:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET_NAME=your-bucket-name
```

### Step 6: Verify the Bucket

```bash
# List your buckets
aws s3 ls

# Check bucket details
aws s3api head-bucket --bucket $BUCKET_NAME
```

---

## Method 2: Using AWS Console (Web Interface)

### Step 1: Log in to AWS Console

1. Go to [AWS Console](https://console.aws.amazon.com/)
2. Sign in with your AWS account credentials

### Step 2: Navigate to S3

1. In the AWS Console search bar, type "S3"
2. Click on "S3" service

### Step 3: Create a Bucket

1. Click the **"Create bucket"** button
2. **Bucket name**: Enter a unique name (e.g., `asset-organizer-yourname-2024`)
3. **AWS Region**: Select your preferred region (e.g., `us-east-1`)
4. **Object Ownership**: Choose "ACLs disabled" (recommended)
5. **Block Public Access settings**: 
   - ✅ Keep all options checked (recommended for security)
   - Your app uses presigned URLs, so public access is not needed
6. **Bucket Versioning**: Enable if desired (optional)
7. **Default encryption**: Enable (recommended)
   - Encryption type: Amazon S3 managed keys (SSE-S3)
8. Click **"Create bucket"**

### Step 4: Configure CORS (If needed for direct browser uploads)

1. Click on your bucket name
2. Go to the **"Permissions"** tab
3. Scroll down to **"Cross-origin resource sharing (CORS)"**
4. Click **"Edit"**
5. Paste the following configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

6. Click **"Save changes"**

### Step 5: Get Your AWS Credentials

1. Go to **IAM** service in AWS Console
2. Click **"Users"** → Your username → **"Security credentials"** tab
3. Under **"Access keys"**, click **"Create access key"**
4. Choose use case: **"Application running outside AWS"** or **"Local code"**
5. Download or copy your Access Key ID and Secret Access Key
6. **Important**: Save the Secret Access Key immediately - you won't be able to see it again!

### Step 6: Update Environment Variables

Update your `.env` file:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_S3_BUCKET_NAME=your-bucket-name-here
```

---

## Method 3: Using AWS SDK (Programmatic)

You can also create the bucket programmatically using a Node.js script. This is useful for automation or CI/CD.

Create a file `scripts/create-s3-bucket.ts`:

```typescript
import { S3Client, CreateBucketCommand, PutBucketVersioningCommand, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function createBucket() {
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const region = process.env.AWS_REGION || "us-east-1";

  if (!bucketName) {
    throw new Error("AWS_S3_BUCKET_NAME environment variable is required");
  }

  try {
    // Create the bucket
    console.log(`Creating bucket: ${bucketName} in region: ${region}`);
    
    const createCommand = new CreateBucketCommand({
      Bucket: bucketName,
      ...(region !== "us-east-1" && {
        CreateBucketConfiguration: {
          LocationConstraint: region,
        },
      }),
    });

    await s3Client.send(createCommand);
    console.log(`✅ Bucket ${bucketName} created successfully!`);

    // Enable versioning (optional)
    const versioningCommand = new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: {
        Status: "Enabled",
      },
    });
    await s3Client.send(versioningCommand);
    console.log("✅ Versioning enabled");

    // Block public access (recommended)
    const publicAccessBlockCommand = new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    });
    await s3Client.send(publicAccessBlockCommand);
    console.log("✅ Public access blocked");

    console.log("\n🎉 Bucket setup complete!");
    console.log(`\nMake sure your .env file has:\nAWS_S3_BUCKET_NAME=${bucketName}`);
  } catch (error: any) {
    if (error.name === "BucketAlreadyExists") {
      console.log(`⚠️  Bucket ${bucketName} already exists`);
    } else if (error.name === "BucketAlreadyOwnedByYou") {
      console.log(`✅ Bucket ${bucketName} is already owned by you`);
    } else {
      console.error("❌ Error creating bucket:", error.message);
      throw error;
    }
  }
}

createBucket();
```

Run the script:

```bash
# Make sure your .env file has the required variables
npx tsx scripts/create-s3-bucket.ts
```

---

## IAM Permissions Required

Your AWS user/role needs the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

Or use the AWS managed policy: `AmazonS3FullAccess` (less secure, but simpler for development)

---

## Troubleshooting

### Error: "Bucket name already exists"
S3 bucket names are globally unique. Try adding a random suffix or your name/company name.

### Error: "Access Denied"
- Check your AWS credentials are correct
- Verify your IAM user has S3 permissions
- Ensure the bucket is in the correct region

### Error: "InvalidBucketName"
- Bucket names must be lowercase
- No uppercase letters or special characters (except dots and hyphens)
- Must start and end with a letter or number

### Presigned URLs not working
- Ensure CORS is configured if uploading from browser
- Check that your IAM permissions include `s3:PutObject` and `s3:GetObject`
- Verify the bucket name in your `.env` matches the actual bucket name

---

## Next Steps

After creating your bucket:

1. ✅ Verify your `.env` file has all required variables
2. ✅ Test the bucket by running your application
3. ✅ Try uploading a file through the application
4. ✅ Check the S3 console to confirm files are being stored

For production, consider:
- Setting up lifecycle policies for old files
- Enabling S3 access logging
- Using AWS CloudFront for CDN (optional)
- Setting up backup/versioning policies

---

## Known Issues

### PDF Upload Issues

If PDFs fail to upload with an ERROR status, see `PDF_ERROR_FIX.md` for troubleshooting steps. This is typically caused by a webpack bundling issue with the `pdf-parse` library.

**Quick Fix:**
1. Ensure `next.config.js` has the proper webpack externals configuration
2. Restart your Next.js dev server
3. Use the "Retry" button on failed assets

---

**Last Updated**: January 1, 2026
