import { QueryClient } from '@tanstack/react-query'

// Single app-wide client. Queries opt into polling via their own
// `refetchInterval` — no global default here since most of the panel still
// fetches via plain hooks/socket events, not React Query.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
