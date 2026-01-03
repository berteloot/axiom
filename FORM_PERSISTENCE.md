# Form Data Persistence - App-Wide Solution

## Problem
Users were losing their work when switching browser tabs or when the page refreshed due to Next.js's Fast Refresh in development mode.

## Solutions Implemented

### 1. Reduced Aggressive Reloading (`next.config.js`)
```javascript
onDemandEntries: {
  // Keep pages in memory longer (30 seconds instead of default 15)
  maxInactiveAge: 30 * 1000,
  // Number of pages to keep simultaneously
  pagesBufferLength: 5,
}
```

**Benefits:**
- Keeps inactive pages in memory for 30 seconds instead of 15
- Maintains 5 pages in buffer instead of default 2
- Reduces unnecessary page disposals when switching tabs

### 2. Persistent State Hook (`lib/use-persistent-state.ts`)

Created `usePersistentState` hook that:
- ✅ Saves form data to localStorage automatically
- ✅ Restores data when page loads
- ✅ Debounces saves (500ms) to avoid performance issues
- ✅ Clears data after successful submission
- ✅ Works seamlessly with TypeScript
- ✅ Type-safe with full TypeScript support

**Usage Example:**
```typescript
const [value, setValue, clearValue] = usePersistentState("my-form-key", "");

// Use it just like useState
setValue("new value");

// Clear after successful submission
clearValue();
```

### 3. Global Form Persistence Provider (`components/FormPersistenceProvider.tsx`)

A global provider that:
- ✅ Detects if there's unsaved form data in localStorage
- ✅ Warns users before closing tab/window if data exists
- ✅ Works automatically across all pages
- ✅ No manual setup needed per form

### 4. Forms Updated with Persistence

All major forms now use persistent state:

#### ✅ Account Management (`app/settings/accounts/page.tsx`)
- Account name editing
- Manager name and email fields
- Data persists across tab switches

#### ✅ Admin Settings (`app/settings/admin/page.tsx`)
- Organization settings (name, description, website, etc.)
- All configuration fields
- Complex nested object state supported

#### ✅ Create Account Form (`components/accounts/CreateAccountForm.tsx`)
- New account name field
- Clears automatically after successful creation

## How It Works

```
User types in form → Data saved to localStorage (debounced 500ms)
                  ↓
User switches tab → Page might dispose
                  ↓
User returns → Data restored from localStorage
             ↓
User submits → clearPersistedData() called → localStorage cleaned
```

## Benefits

1. **Better UX**: Users never lose their work
2. **Development friendly**: Less frustration during development
3. **Production ready**: Works in both dev and production
4. **Type-safe**: Full TypeScript support
5. **Automatic**: Global provider adds warning automatically
6. **Flexible**: Easy to apply to new forms
7. **App-wide**: Works on ALL pages

## Files Changed

- ✅ `next.config.js` - Reduced page disposal frequency
- ✅ `lib/use-persistent-state.ts` - Core persistence hook
- ✅ `components/FormPersistenceProvider.tsx` - Global warning provider
- ✅ `app/layout.tsx` - Added FormPersistenceProvider
- ✅ `components/accounts/CreateAccountForm.tsx` - Account creation
- ✅ `app/settings/accounts/page.tsx` - Account editing + managers
- ✅ `app/settings/admin/page.tsx` - Admin settings

## Usage in New Forms

To add persistence to any new form:

```typescript
import { usePersistentState } from "@/lib/use-persistent-state";

// Replace useState with usePersistentState
const [formData, setFormData, clearFormData] = usePersistentState(
  "unique-form-key", // Use descriptive, unique key
  initialValue
);

// Use normally
setFormData(newValue);

// Clear after successful save (optional but recommended)
try {
  await saveData(formData);
  clearFormData(); // Clear persisted data
} catch (error) {
  // Data stays persisted on error
}
```

## Testing

1. **Test persistence**: Type in any form, switch tabs, return → data should be there
2. **Test warning**: Type in form, try to close tab → browser should warn
3. **Test clearing**: Submit form successfully → data should be cleared
4. **Test errors**: Submit with error → data should stay persisted

## Future Enhancements

Consider applying to:
- Brand Identity forms (react-hook-form)
- Product Line forms (react-hook-form)
- Asset upload forms
- Any form with significant user input
