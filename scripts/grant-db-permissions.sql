-- Grant permissions to assetorg_user
-- Run this script by connecting to your Render database

-- Grant all privileges on all tables in the public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO assetorg_user;

-- Grant all privileges on all sequences (for auto-increment IDs)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO assetorg_user;

-- Grant usage on the schema
GRANT USAGE ON SCHEMA public TO assetorg_user;

-- For future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO assetorg_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO assetorg_user;

-- Verify permissions (optional - will show current grants)
SELECT 
    grantee, 
    table_name, 
    privilege_type 
FROM information_schema.table_privileges 
WHERE grantee = 'assetorg_user' 
AND table_schema = 'public';
