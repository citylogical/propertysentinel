// Minimal @clerk/nextjs mock for renderToString verification.
const React = require('react')

module.exports = {
  useUser: () => {
    const s = globalThis.__clerkState || { isSignedIn: false, isLoaded: true }
    return { isSignedIn: s.isSignedIn, isLoaded: s.isLoaded, user: s.isSignedIn ? { id: 'user_test' } : null }
  },
  SignInButton: ({ children }) => React.createElement(React.Fragment, null, children),
}
