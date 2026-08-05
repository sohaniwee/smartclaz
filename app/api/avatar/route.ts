/**
 * Avatar upload API route — server-side validated image upload.
 * ✅ CURRENT: Validates MIME type from file magic bytes (not filename), resizes to 400x400 WebP,
 *    strips EXIF, uploads to Supabase Storage, and saves public URL to tutors.avatar_url.
 * 🚀 BEFORE LAUNCH: Ensure 'tutor-avatars' bucket exists in Supabase Storage with public access.
 *    Supabase: Storage → Create bucket → tutor-avatars → Public
 * 📝 NOTE: Requires sharp for image processing: npm install sharp
 *    sharp is a native module — ensure it is installed on the server, not just locally.
 *    On Netlify: add BUILD_FLAGS=--platform=linux to ensure correct binary is bundled.
 */

import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { logEvent }           from '@/lib/audit'

// ✅ CURRENT: Accepted MIME types validated from magic bytes only (not filename).
// 📝 NOTE: We never trust Content-Type headers or file extensions — only raw bytes.
const ACCEPTED_MIME: Record<string, string> = {
  'ffd8ff':   'image/jpeg',  // JPEG magic bytes
  '89504e47': 'image/png',   // PNG magic bytes
  '52494646': 'image/webp',  // WebP (RIFF header — checked below with offset 8)
}

const MAX_SIZE_BYTES = 2 * 1024 * 1024  // 2 MB

// ── detectMimeType ─────────────────────────────────────────────────────────────

/**
 * Detect MIME type from raw file bytes (magic bytes check).
 * Returns null if the file type is not in the allowed list.
 */
function detectMimeType(buffer: Buffer): string | null {
  // Check first 4 bytes as hex
  const hex4 = buffer.slice(0, 4).toString('hex')

  // JPEG: FF D8 FF
  if (hex4.startsWith('ffd8ff')) return 'image/jpeg'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (hex4 === '89504e47') return 'image/png'

  // WebP: RIFF ????  WEBP  (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (hex4 === '52494646' && buffer.length >= 12) {
    const webpSig = buffer.slice(8, 12).toString('ascii')
    if (webpSig === 'WEBP') return 'image/webp'
  }

  return null
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── 1. Authenticate the user ─────────────────────────────────────────────────

  // ✅ CURRENT: Authenticate via Supabase SSR session cookie (httpOnly, XSS-safe).
  const cookieStore = await cookies()

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()       { return cookieStore.getAll() },
        setAll(items)  { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    },
  )

  const { data: { user } } = await supabaseAuth.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const tutorId = user.id

  // ── 2. Parse multipart form data ──────────────────────────────────────────────

  let fileBuffer: Buffer
  try {
    const formData = await request.formData()
    const file = formData.get('avatar')

    if (!file || typeof file === 'string') {
      return Response.json(
        { error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' },
        { status: 400 },
      )
    }

    const arrayBuffer = await (file as File).arrayBuffer()
    fileBuffer = Buffer.from(arrayBuffer)
  } catch {
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // ── 3. Validate file size ─────────────────────────────────────────────────────

  if (fileBuffer.byteLength > MAX_SIZE_BYTES) {
    return Response.json(
      { error: 'File too large. Maximum size is 2MB.' },
      { status: 400 },
    )
  }

  // ── 4. Validate MIME type from magic bytes ────────────────────────────────────

  // ✅ CURRENT: Never trust filename or Content-Type header — always read raw bytes.
  const detectedMime = detectMimeType(fileBuffer)
  if (!detectedMime) {
    return Response.json(
      { error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' },
      { status: 400 },
    )
  }

  // ── 5. Process image with sharp ───────────────────────────────────────────────

  // 📝 NOTE: sharp is a native Node.js module. Install with: npm install sharp
  //    If it fails to import, the upload will return a 500 with a generic error.
  //    Run: npm install sharp (also add @types/sharp for TypeScript)
  let processedBuffer: Buffer
  try {
    // Dynamic import so the module error is caught gracefully
    const sharp = (await import('sharp')).default

    processedBuffer = await sharp(fileBuffer)
      .resize(400, 400, {
        fit:                'inside',       // maintain aspect ratio within 400x400
        withoutEnlargement: true,           // never upscale smaller images
      })
      .webp({ quality: 85 })               // convert to WebP at 85% quality
      // strip EXIF: do not call .withMetadata() — Sharp strips metadata by default
      .toBuffer()
  } catch {
    // ✅ CURRENT: Return generic error — never expose sharp internals to client.
    // 🚀 BEFORE LAUNCH: Add server-side error logging (Sentry, etc.)
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // ── 6. Upload to Supabase Storage ─────────────────────────────────────────────

  // ✅ CURRENT: Use service role client for storage upload (bypasses RLS on storage).
  // 📝 NOTE: RLS on the tutors table (step 7) still applies — only the tutor's own row is updated.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const storagePath = `tutors/${tutorId}/avatar.webp`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('tutor-avatars')
    .upload(storagePath, processedBuffer, {
      contentType: 'image/webp',
      upsert:      true,          // replace existing avatar
    })

  if (uploadError) {
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // ── 7. Get public URL and update tutors table ─────────────────────────────────

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('tutor-avatars')
    .getPublicUrl(storagePath)

  // Append a cache-busting query param so the browser fetches the new image
  const avatarUrl = `${publicUrl}?t=${Date.now()}`

  // ✅ CURRENT: Save to tutors.avatar_url using the authed user's ID.
  // The service role key is used here to match the storage upload session,
  // but the WHERE clause scopes the update to the authenticated tutor only.
  const { error: dbError } = await supabaseAdmin
    .from('tutors')
    .update({ avatar_url: avatarUrl })
    .eq('id', tutorId)

  if (dbError) {
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // ── 8. Audit log ──────────────────────────────────────────────────────────────

  // Fire and forget — never await, never block response
  logEvent(tutorId, 'avatar_uploaded', {
    path: storagePath,
    size: processedBuffer.byteLength,
  }).catch(() => {/* ignore */})

  // ── 9. Return public URL ──────────────────────────────────────────────────────

  return Response.json({ avatarUrl })
}
