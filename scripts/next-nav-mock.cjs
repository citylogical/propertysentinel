// Minimal next/navigation mock for renderToString verification.
module.exports = {
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    refresh: () => {},
  }),
  usePathname: () => '/address/540-n-lake-shore-dr',
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
}
