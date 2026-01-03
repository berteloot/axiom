#!/bin/bash
# Script to grant database permissions
# Usage: ./scripts/grant-db-permissions.sh

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Granting database permissions...${NC}"

# Read DATABASE_URL from .env
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    exit 1
fi

DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL not found in .env${NC}"
    exit 1
fi

echo "Connecting to database..."

# Extract connection details and run SQL
psql "$DATABASE_URL" << EOF
-- Grant all privileges on all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO assetorg_user;

-- Grant all privileges on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO assetorg_user;

-- Grant usage on the schema
GRANT USAGE ON SCHEMA public TO assetorg_user;

-- For future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO assetorg_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO assetorg_user;

-- Verify
SELECT 'Permissions granted successfully!' AS status;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Permissions granted successfully!${NC}"
else
    echo -e "${RED}❌ Error granting permissions${NC}"
    echo ""
    echo "If psql is not installed, you can:"
    echo "1. Install PostgreSQL client: brew install postgresql (macOS)"
    echo "2. Or connect via Render's database interface"
    echo "3. Or use the SQL script in scripts/grant-db-permissions.sql"
    exit 1
fi
