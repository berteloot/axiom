#!/bin/bash

# S3 Bucket Creation Script for Asset Organizer
# This script creates an S3 bucket with recommended settings

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
BUCKET_NAME=""
REGION="us-east-1"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --bucket-name)
      BUCKET_NAME="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 --bucket-name <name> [--region <region>]"
      echo ""
      echo "Options:"
      echo "  --bucket-name  S3 bucket name (required, must be globally unique)"
      echo "  --region       AWS region (default: us-east-1)"
      echo "  --help         Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Validate bucket name is provided
if [ -z "$BUCKET_NAME" ]; then
  echo -e "${YELLOW}Bucket name not provided.${NC}"
  echo "Generating a unique bucket name..."
  BUCKET_NAME="asset-organizer-$(date +%s)-$(openssl rand -hex 4)"
  echo -e "${GREEN}Using bucket name: ${BUCKET_NAME}${NC}"
fi

# Validate bucket name format
if ! [[ "$BUCKET_NAME" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]] || [ ${#BUCKET_NAME} -lt 3 ] || [ ${#BUCKET_NAME} -gt 63 ]; then
  echo -e "${RED}Error: Invalid bucket name${NC}"
  echo "Bucket names must:"
  echo "  - Be 3-63 characters long"
  echo "  - Contain only lowercase letters, numbers, dots, and hyphens"
  echo "  - Begin and end with a letter or number"
  exit 1
fi

echo -e "${GREEN}Creating S3 bucket: ${BUCKET_NAME} in region: ${REGION}${NC}"

# Create bucket command differs for us-east-1
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    || { echo -e "${RED}Failed to create bucket${NC}"; exit 1; }
else
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" \
    || { echo -e "${RED}Failed to create bucket${NC}"; exit 1; }
fi

echo -e "${GREEN}✅ Bucket created successfully!${NC}"

# Enable versioning
echo "Enabling versioning..."
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled \
  || echo -e "${YELLOW}⚠️  Could not enable versioning (may already be enabled)${NC}"

# Block public access
echo "Blocking public access..."
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  || echo -e "${YELLOW}⚠️  Could not set public access block${NC}"

# Set CORS configuration
echo "Setting CORS configuration..."
cat > /tmp/cors-config.json << EOF
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

aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --cors-configuration file:///tmp/cors-config.json \
  || echo -e "${YELLOW}⚠️  Could not set CORS configuration${NC}"

# Clean up temp file
rm -f /tmp/cors-config.json

echo ""
echo -e "${GREEN}🎉 Bucket setup complete!${NC}"
echo ""
echo "Update your .env file with:"
echo "  AWS_S3_BUCKET_NAME=$BUCKET_NAME"
echo "  AWS_REGION=$REGION"
echo ""
echo "Verify the bucket:"
echo "  aws s3 ls s3://$BUCKET_NAME"
