-- Complete permission fix for assetorg_user
-- Run this as the database owner/admin

-- 1. Grant schema usage (required)
GRANT USAGE ON SCHEMA public TO assetorg_user;

-- 2. Grant all privileges on existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO assetorg_user;

-- 3. Grant all privileges on sequences (for auto-increment)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO assetorg_user;

-- 4. Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO assetorg_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO assetorg_user;

-- 5. Ensure the user owns the table (if not already)
ALTER TABLE public.assets OWNER TO assetorg_user;

-- 6. Verify permissions
SELECT 
    'Schema USAGE' as check_type,
    has_schema_privilege('assetorg_user', 'public', 'USAGE') as granted
UNION ALL
SELECT 
    'Table INSERT',
    has_table_privilege('assetorg_user', 'assets', 'INSERT')
UNION ALL
SELECT 
    'Table SELECT',
    has_table_privilege('assetorg_user', 'assets', 'SELECT')
UNION ALL
SELECT 
    'Table UPDATE',
    has_table_privilege('assetorg_user', 'assets', 'UPDATE')
UNION ALL
SELECT 
    'Table DELETE',
    has_table_privilege('assetorg_user', 'assets', 'DELETE');
