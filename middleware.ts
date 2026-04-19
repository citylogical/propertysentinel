import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * Property pages, marketing, search, and public portfolio audits stay public;
 * only account areas require sign-in. (/audit/* is intentionally not protected.)
 */
const isProtectedRoute = createRouteMatcher(['/profile(.*)', '/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
