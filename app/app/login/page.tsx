"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const [flowId, setFlowId] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [flowLoading, setFlowLoading] = useState(true)

  useEffect(() => {
    const kratosUrl = process.env.NEXT_PUBLIC_KRATOS_PUBLIC_URL
    fetch(`${kratosUrl}/self-service/login/api`)
      .then((r) => r.json())
      .then((flow) => setFlowId(flow.id))
      .catch(() => setError("Failed to initialise login. Please refresh."))
      .finally(() => setFlowLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!flowId) return
    setLoading(true)
    setError("")
    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
      flowId,
    })
    setLoading(false)
    if (result?.error) {
      setError(result.error)
      // Refresh flow for next attempt
      const kratosUrl = process.env.NEXT_PUBLIC_KRATOS_PUBLIC_URL
      fetch(`${kratosUrl}/self-service/login/api`)
        .then((r) => r.json())
        .then((flow) => setFlowId(flow.id))
        .catch(() => {})
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#1a1a2e" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: "#16213e", borderColor: "#2a2a4a" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <span
            className="w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "#7F77DD" }}
          >
            R
          </span>
          <span className="font-bold text-lg" style={{ color: "#e0e0e0" }}>
            REXFORM
          </span>
          <span className="font-bold text-lg" style={{ color: "#7F77DD" }}>
            · Notes
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: "#e0e0e0" }}>
          Welcome back
        </h1>
        <p className="text-sm mb-8" style={{ color: "#8892a4" }}>
          Sign in to your workspace
        </p>

        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm border"
            style={{
              background: "#2d1a1a",
              borderColor: "#7a2020",
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "#8892a4" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 transition-all"
              style={{
                background: "#1a1a2e",
                borderColor: "#2a2a4a",
                color: "#e0e0e0",
              }}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "#8892a4" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 transition-all"
              style={{
                background: "#1a1a2e",
                borderColor: "#2a2a4a",
                color: "#e0e0e0",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || flowLoading}
            className="w-full py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50"
            style={{ background: "#7F77DD", color: "#fff" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "#8892a4" }}>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium hover:underline"
            style={{ color: "#7F77DD" }}
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
