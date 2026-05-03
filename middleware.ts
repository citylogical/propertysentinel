import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * Property pages, marketing, search, public portfolio audits, and /dashboard/*
 * stay public at the middleware layer — dashboard pages use auth() to branch UI
 * (empty states vs portfolio/activity). Only profile remains clerk-protected here.
 */
const isProtectedRoute = createRouteMatcher(['/profile(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
