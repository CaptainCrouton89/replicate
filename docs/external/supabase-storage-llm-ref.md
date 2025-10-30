# Supabase Storage LLM Reference

## Critical Signatures

### File Upload
```javascript
supabase.storage.from(bucketName).upload(path, fileBody, fileOptions?)
```
- **path**: string, format "folder/subfolder/filename.png" - can be nested
- **fileBody**: File | Blob | ArrayBuffer - React Native ONLY supports ArrayBuffer decoded from base64
- **fileOptions**: object
  - `upsert`: boolean (overwrite existing, requires SELECT + UPDATE RLS perms)
  - `cacheControl`: string (cache duration in seconds, e.g., "3600")
  - `contentType`: string (MIME type, will be set from file extension if omitted)
- **Returns**: Promise<{ data: { path, id }, error }>
- **RLS Required**: INSERT permission minimum; SELECT + UPDATE if using upsert

### Signed Download URL
```javascript
supabase.storage.from(bucketName).createSignedUrl(path, expiresIn, options?)
```
- **path**: string, file path with extension
- **expiresIn**: number in seconds (no documented min/max)
- **options.transform**: { width: 1-2500, height: 1-2500, quality: 20-100, resize: 'cover'|'contain'|'fill' }
- **options.download**: boolean | string (true = force download, string = custom filename)
- **Returns**: Promise<{ data: { signedUrl }, error }>
- **RLS Required**: SELECT permission on storage.objects table
- **Gotcha**: transform options are IMMUTABLE in signed URL - embedded in token, cannot change after signing

### Signed Upload URL (2-hour expiration, non-customizable)
```javascript
supabase.storage.from(bucketName).createSignedUploadUrl(path, options?)
```
- **path**: string, file path with extension
- **options**: Currently undocumented - verify library version
- **Returns**: Promise<{ data: { signedUrl, token }, error }>
- **Validity**: Fixed 2 hours, NOT customizable
- **RLS Required**: INSERT permission on storage.objects table
- **Usage**: Use token with `uploadToSignedUrl()` method from client side

### Upload to Signed URL
```javascript
supabase.storage.from(bucketName).uploadToSignedUrl(path, token, fileBody, fileOptions?)
```
- **path**: string, same path as in createSignedUploadUrl
- **token**: string from createSignedUploadUrl response
- **fileBody**: File | Blob | ArrayBuffer
- **fileOptions**: { contentType, cacheControl, upsert }
- **Returns**: Promise<{ data: { path, id }, error }>

### Get Public URL (no HTTP request, sync)
```javascript
supabase.storage.from(bucketName).getPublicUrl(path, options?)
```
- **path**: string
- **options.transform**: { width, height, quality, resize, format: 'origin' }
- **Returns**: { data: { publicUrl }, error: null }
- **Format**: `https://[project_id].supabase.co/storage/v1/object/public/[bucket]/[path]`
- **Gotcha**: format='origin' disables auto-optimization (WebP); default auto-converts to WebP for Chrome

### Download (private buckets only, requires auth header)
```javascript
supabase.storage.from(bucketName).download(path)
```
- **path**: string
- **Returns**: Promise<{ data: Blob, error }>
- **Use Case**: Private buckets. Public buckets should use getPublicUrl or HTTP GET

## Configuration Shapes

### Bucket Configuration
```typescript
// Buckets are private by default
// Public buckets: `/storage/v1/object/public/[bucket]/[path]` - no auth needed
// Private buckets: all operations subject to RLS policies

// Upload restrictions at bucket level:
- max_file_size: number (bytes)
- allowed_mime_types: string[] (e.g., ["image/png", "image/jpeg"])
- public: boolean (default: false)
```

### RLS Policy Examples (on storage.objects table)

**Authenticated upload to specific bucket:**
```sql
create policy "authenticated_upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'my_bucket');
```

**User-specific folder (e.g., avatars/user_123/...)**
```sql
create policy "user_upload_own_folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'my_bucket'
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
);
```

**User downloads own files:**
```sql
create policy "user_download_own" on storage.objects
for select to authenticated
using ((select auth.uid()) = owner_id::uuid);
```

**Upsert (update existing):**
```sql
-- Needs INSERT, SELECT, and UPDATE
create policy "user_upsert" on storage.objects
for update to authenticated
using ((select auth.uid()) = owner_id::uuid)
with check ((select auth.uid()) = owner_id::uuid);
```

**Restrict file type (PNG only):**
```sql
with check (
  bucket_id = 'images'
  AND storage.extension(name) = 'png'
);
```

**Service key upload (bypass RLS entirely):**
```sql
create policy "service_role_upload" on storage.objects
for insert to service_role
with check (true);
```

## Image Transformation Parameters

### Transform Options (in getPublicUrl or createSignedUrl)
```typescript
transform: {
  width: number,      // 1-2500, integer only
  height: number,     // 1-2500, integer only
  quality: number,    // 20-100 (default 80)
  resize: 'cover'     // cover (crop, default) | contain (letterbox) | fill (stretch)
  format: 'origin'    // 'origin' = disable auto-optimization, return source format
}
```

### Supported Formats & Limits
- **Supported**: PNG, JPEG, WebP, AVIF, GIF, ICO, SVG, BMP, TIFF
- **Source but NOT output**: HEIC (cannot convert to other formats)
- **Max file size**: 25MB
- **Max resolution**: 50MP
- **Single dimension specified**: Auto-crops maintaining aspect ratio

### Auto-Optimization Gotchas
- **Default behavior**: Automatically converts to WebP for Chrome (respects client capabilities)
- **format='origin'**: Disables optimization, returns source format
- **AVIF**: Coming in future versions, not yet default
- **Pricing**: $5 per 1,000 origin images on Pro+ plans (only after quota exceeded)
- **Public bucket transforms**: Applied via CDN, cached globally
- **Private bucket transforms**: Must be in createSignedUrl (embedded in token), cannot change after signing

## Non-Obvious Behaviors & Gotchas

### Access Model Basics
- **Default**: ALL buckets are PRIVATE
- **Private buckets**: Require authenticated download via SDK, signed URL, or JWT header
- **Public buckets**: Direct URL access allowed, but upload/delete still require RLS policies
- **Public URL format**: `https://PROJECT_ID.supabase.co/storage/v1/object/public/BUCKET/PATH`
- **Authenticated URL format**: `https://PROJECT_ID.supabase.co/storage/v1/object/authenticated/BUCKET/PATH` + Authorization header

### RLS Policy Gotchas
- **No default policy**: By default, Storage blocks ALL operations without explicit RLS policies
- **Owner assignment**: When uploading, owner_id is automatically set to auth.uid() from JWT sub claim
- **Service keys bypass RLS**: Use ONLY in trusted server contexts (API routes, edge functions)
- **Anon key limitations**: Public buckets work with anon keys, private buckets need authenticated session
- **Upsert complexity**: Requires INSERT + SELECT + UPDATE permissions (not just INSERT)

### Signed URL Constraints
- **Download URL**: No expiration min/max documented; use reasonable values (60-86400 seconds typical)
- **Upload URL**: FIXED 2-hour expiration, NOT customizable
- **Transform immutability**: Transforms in signed URLs are tokenized - cannot modify transform in URL
- **Token scope**: Signed upload tokens can ONLY be used for specified path
- **Download param**: Append ?download or ?download=filename.ext to trigger download vs preview

### File Operations Pre-requisites
- **Bucket must exist**: Upload fails if bucket doesn't exist
- **Path format**: Use forward slashes for nested folders; no leading slash
- **File metadata**: owner_id auto-set on upload; content_type auto-detected from extension
- **Cache control**: TTL in seconds, e.g., cacheControl="86400" for 24 hours
- **Upsert RLS**: Requires SELECT + UPDATE, not just INSERT

### React Native Specific
- File/Blob/FormData not supported
- MUST use ArrayBuffer decoded from base64
- Requires async storage configuration for session persistence

### CDN & Caching
- **Public buckets**: CDN cached globally across 285+ cities
- **Private signed URLs**: Not cached (always validated)
- **Cache control**: Set at object level via cacheControl parameter
- **Format optimization**: Automatic per-client-capability, not controllable client-side

## Version: 2025.10

**Documentation sources:**
- Supabase Storage official docs (Oct 2025)
- JavaScript SDK reference
- Storage API reference
- Community discussions & implementations
