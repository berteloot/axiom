# "In Use" Feature Implementation

## Overview
This document describes the implementation of the "In Use" feature, which allows users to mark assets as currently being used in campaigns or projects, and filter assets by their usage status.

## Features

### 1. Asset Status Tracking
- Each asset can be marked as "in use" or "available"
- Default status is "available" (not in use)
- Status is persisted in the database

### 2. User Interface Components

#### Asset Library Table
- New "In Use" column between "Title" and "Type" columns
- Checkbox for each asset to toggle in-use status
- Checkbox disabled for assets with status `PROCESSING` or `PENDING`
- Changes are saved immediately when toggled

#### Asset Review Window
- "In Use" checkbox with descriptive label and icon
- Located at the bottom of the review form
- Includes help text: "Mark this asset as currently being used in campaigns or projects"
- Status is saved when approving the asset

#### Filter Panel
- New "Usage Status" dropdown filter
- Three options:
  - **All assets** - Show all assets (default)
  - **In use** - Show only assets marked as in use
  - **Available** - Show only assets available for use
- Active filter badge displayed when filter is applied
- Filter state persists in URL parameters

## Technical Implementation

### Database Schema
```sql
-- Added to assets table
inUse BOOLEAN DEFAULT false NOT NULL
```

### API Endpoints
- `PATCH /api/assets/[id]` - Updated to accept `inUse` field
- Validation: `inUse: z.boolean().optional()`

### Files Modified

1. **Database & Types**
   - `prisma/schema.prisma` - Added `inUse` field to Asset model
   - `lib/types.ts` - Added `inUse` to Asset interface
   - `lib/validations.ts` - Added `inUse` validation

2. **API**
   - `app/api/assets/[id]/route.ts` - Handle inUse updates
   - `app/api/assets/bulk-update/route.ts` - Fixed TypeScript type issue

3. **Components**
   - `components/AssetTable.tsx` - Added In Use column with checkbox
   - `components/ReviewModal.tsx` - Added inUse to form state
   - `components/review/ReviewForm.tsx` - Added In Use checkbox UI
   - `components/AssetFilters.tsx` - Added Usage Status filter

4. **Dashboard**
   - `app/dashboard/DashboardClient.tsx` - Added filter state and handler

5. **Scripts**
   - `scripts/add-in-use-field.sql` - Database migration script
   - `scripts/migrate-to-brand-context.ts` - Fixed for junction table

## Database Migration

Before deploying, run the migration script:

```bash
psql $DATABASE_URL -f scripts/add-in-use-field.sql
```

Or manually execute:

```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "inUse" BOOLEAN DEFAULT false NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_in_use ON assets ("inUse");
COMMENT ON COLUMN assets."inUse" IS 'Whether the asset is currently being used in campaigns or projects';
```

## Usage Instructions

### Marking Assets as In Use

**From Asset Library Table:**
1. Navigate to the "Library View" tab
2. Find the asset in the table
3. Check/uncheck the checkbox in the "In Use" column
4. Status is saved automatically

**From Asset Review Window:**
1. Click "Review" on any asset
2. Scroll to the bottom of the review form
3. Check/uncheck the "In Use" checkbox
4. Click "Approve & Save" to persist changes

### Filtering by Usage Status

1. Click the "Filters" button to expand the filter panel
2. Locate the "Usage Status" dropdown (has a checkbox icon)
3. Select your preference:
   - **All assets** - View all assets
   - **In use** - View only assets currently in use
   - **Available** - View only available assets
4. The filter is applied immediately
5. An active filter badge appears showing the current filter

## Best Practices

1. **Mark assets as "In Use" when:**
   - Asset is actively used in a running campaign
   - Asset is included in current marketing materials
   - Asset is scheduled for upcoming publications

2. **Mark assets as "Available" when:**
   - Campaign has ended
   - Asset is no longer actively promoted
   - Asset is ready for reuse

3. **Use the filter to:**
   - Quickly identify available assets for new campaigns
   - Track which assets are currently deployed
   - Avoid accidentally modifying assets in active use

## Testing Checklist

- [x] Database schema updated with `inUse` field
- [x] API endpoint accepts and persists `inUse` status
- [x] Asset table displays "In Use" column with functional checkbox
- [x] Review modal includes "In Use" checkbox
- [x] Filter dropdown includes "Usage Status" option
- [x] Filter correctly shows in-use assets only
- [x] Filter correctly shows available assets only
- [x] Active filter badge displays correctly
- [x] TypeScript compilation succeeds
- [x] No new linter errors introduced

## Future Enhancements

Potential improvements for future iterations:

1. **Usage Analytics**
   - Track when assets were marked as in use
   - Show usage history/timeline

2. **Bulk Operations**
   - Bulk mark assets as in use
   - Bulk mark assets as available

3. **Notifications**
   - Alert when in-use assets are about to expire
   - Notify when assets have been in use for extended periods

4. **Campaign Association**
   - Link assets to specific campaigns
   - Show which campaign an asset is used in
