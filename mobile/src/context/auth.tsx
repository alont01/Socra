import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { apiFetch, setUnauthorizedHandler } from '@/src/lib/api'

const TOKEN_KEY = 'socra.token'
const USER_KEY = 'socra.user'

export interface AuthUser {
  id: string
  email: string
  role: string
  parentProfile?: { name?: string } | null
}

interface TokenResponse {
  token: string
  user: AuthUser
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  loading: true,
  login: async () => { throw new Error('AuthProvider missing') },
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session on launch.
  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ])
        if (t) setToken(t)
        if (u) setUser(JSON.parse(u))
      } catch {
        // ignore — treated as logged out
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const login = async (email: string, password: string) => {
    const res = await apiFetch<TokenResponse>('/api/auth/token', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
    })
    await SecureStore.setItemAsync(TOKEN_KEY, res.token)
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(res.user))
    setToken(res.token)
    setUser(res.user)
    return res.user
  }

  const logout = useCallback(async () => {
    setToken(null)
    setUser(null)
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => {})
  }, [])

  // Any 401 from apiFetch means the stored token expired or was revoked — drop
  // the session so the app's auth gate bounces to /login, instead of every
  // screen showing a Retry that can't work.
  useEffect(() => {
    setUnauthorizedHandler(() => { void logout() })
    return () => setUnauthorizedHandler(null)
  }, [logout])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
