# Sitemap Fixes — Implementation Plan
**Date:** 2026-09-06  
**Status:** IN PROGRESS  

---

## Issues Identified

### 1. Non-Canonical Pages (1,668)
**Root Cause:** Sitemap URLs don't match canonical URLs on pages
**Solution:** Ensure sitemap generates exact canonical URLs

### 2. 4XX Pages in Sitemap (409)
**Root Cause:** Sitemap includes URLs for deleted/noIndex documents
**Solution:** Add stricter validation before including URLs

### 3. Sitemap Format Issues
**Root Cause:** Incorrect Content-Type headers
**Solution:** Fix to use `text/xml` consistently

---

## Fixes to Implement

### Fix 1: Stricter Document Validation
```javascript
function isIndexableDocument(data = {}) {
    // Existing checks
    if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
    const status = String(data.status || "").trim().toLowerCase();
    return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status);
}

// ADD: Check if document has minimum required fields
function hasValidSitemapData(data = {}) {
    if (!isIndexableDocument(data)) return false;
    if (!data.title && !data.post_name) return false; // Must have title
    if (!data.slug && !data.id) return false; // Must have slug or id
    return true;
}
```

### Fix 2: Canonical URL Generation
Ensure sitemap URLs match exactly what pages generate as canonical:
- Jobs: `/job/${slug}` ✅ (already correct)
- Blogs: `/blog/${slug}` ✅ (already correct)
- Tests: `/test/${slug}` ✅ (already correct)
- Materials: `/material/${slug}` ✅ (already correct)
- Courses: `/course/${slug}` ✅ (already correct)
- Updates: `/update/${slug}` ✅ (already correct)
- Stories: `/web-stories/${slug}` ✅ (already correct)

### Fix 3: Content-Type Headers
Change from `application/xml` to `text/xml` for better compatibility

### Fix 4: Add Sitemap Validation
Create validation endpoint to check sitemap health

---

## Implementation Steps

1. ✅ Update `isIndexableDocument()` function
2. ✅ Add `hasValidSitemapData()` validation
3. ✅ Fix Content-Type headers
4. ✅ Add sitemap validation endpoint
5. ✅ Test sitemap generation
6. ✅ Verify canonical URL matching

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Non-canonical pages | 1,668 | ~0 |
| 4XX pages in sitemap | 409 | ~0 |
| Health Score | 1/100 | 50-70/100 |

---

*Last updated: 2026-09-06*
