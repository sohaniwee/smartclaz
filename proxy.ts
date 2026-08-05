import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PREFIXES = [
  '/',
  '/login',
  '/signup',
  '/support',           // account recovery + help pages (no auth required)
  '/api/whatsapp/webhook',
  '/api/auth',
]

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true
  return PUBLIC_PREFIXES.slice(1).some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
}

// Inline the signup-redirect logic using the server client directly.
// We cannot import lib/auth.ts here because it uses the browser client.
async function getSignupRedirectPath(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<string | null> {
  const { data: tutor } = await supabase
    .from('tutors')
    .select('status, subjects, payment_instructions, whatsapp_number')
    .eq('id', userId)
    .single()

  if (!tutor) return '/signup'
  if (tutor.status === 'suspended') return '/login?reason=suspended'
  if (!tutor.status || tutor.status === 'pending') return '/signup'
  if (tutor.status === 'active') return null   // fully set up — allow through

  // Incomplete signup — guide to the correct step
  const hasSubjects = Array.isArray(tutor.subjects) && (tutor.subjects as unknown[]).length > 0
  if (!hasSubjects) return '/signup/classes'

  if (!tutor.payment_instructions) return '/signup/payments'

  if (!tutor.whatsapp_number) return '/signup/preferences'

  return null
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always skip static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf|css|js|map)$/)
  ) {
    return NextResponse.next()
  }

  // Fail-open when env vars are not yet configured (pre-setup dev)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session — this also keeps cookies up to date
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const loggedIn = !!user

  // Unauthenticated user on a protected route → send to login with ?next=
  if (!loggedIn && !isPublicRoute(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Logged-in user: check signup completion for signup/login pages and dashboard
  if (loggedIn) {
    // User landing on login page → redirect to correct destination
    if (pathname === '/login' || pathname === '/login/recover') {
      const redirect = await getSignupRedirectPath(supabase, user.id)
      if (redirect === null) {
        // Fully active — send to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      if (redirect !== '/login?reason=suspended') {
        // Incomplete signup — send to the correct step, not back to login
        return NextResponse.redirect(new URL(redirect, request.url))
      }
      // Suspended — stay on login to show the suspended message
      return response
    }

    // User landing on /signup (Step 1 only) when already authenticated
    if (pathname === '/signup') {
      const redirect = await getSignupRedirectPath(supabase, user.id)
      if (redirect === null) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      if (redirect !== '/signup') {
        return NextResponse.redirect(new URL(redirect, request.url))
      }
      return response
    }

    // User landing on /signup/* (steps 2-5)
    if (pathname.startsWith('/signup/')) {
      const redirect = await getSignupRedirectPath(supabase, user.id)
      if (redirect === null) {
        // Fully active — already done, go to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      // Allow the user to be on the correct step or any earlier step
      // (They can go back, but not skip ahead)
      const stepOrder = [
        '/signup',
        '/signup/classes',
        '/signup/payments',
        '/signup/preferences',
      ]
      const currentIdx  = stepOrder.indexOf(pathname)
      const requiredIdx = stepOrder.indexOf(redirect)
      if (currentIdx > requiredIdx && currentIdx !== -1) {
        // They are trying to skip ahead past the required step — redirect back
        return NextResponse.redirect(new URL(redirect, request.url))
      }
      return response
    }

    // Protected routes: verify tutor is active before allowing dashboard access
    if (!isPublicRoute(pathname)) {
      const redirect = await getSignupRedirectPath(supabase, user.id)
      if (redirect !== null) {
        return NextResponse.redirect(new URL(redirect, request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
