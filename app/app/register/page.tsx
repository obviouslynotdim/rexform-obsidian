"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

function passwordStrength(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

export default function RegisterPage() {
  const router = useRouter()
  const [flowId, setFlowId] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const kratosUrl = process.env.NEXT_PUBLIC_KRATOS_PUBLIC_URL
    fetch(`${kratosUrl}/self-service/registration/api`)
      .then((r) => r.json())
      .then((flow) => setFlowId(flow.id))
      .catch(() => setGlobalError("Failed to initialise registration. Please refresh."))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!flowId) return
    setLoading(true)
    setErrors({})
    setGlobalError("")

    const kratosUrl = process.env.NEXT_PUBLIC_KRATOS_PUBLIC_URL
    try {
      const res = await fetch(
        `${kratosUrl}/self-service/registration?flow=${flowId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            method: "password",
            password,
            traits: {
              email,
              name: { first: firstName, last: lastName },
            },
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        // Parse Kratos field-level errors from UI nodes
        const fieldErrors: Record<string, string> = {}
        const nodes: any[] = data?.ui?.nodes ?? []
        for (const node of nodes) {
          const field: string = node?.attributes?.name ?? ""
          const msg: string = node?.messages?.[0]?.text ?? ""
          if (field && msg) fieldErrors[field] = msg
        }
        const globalMsg =
          data?.ui?.messages?.[0]?.text || data?.error?.message || "Registration failed"
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors)
        } else {
          setGlobalError(globalMsg)
        }
        // Refresh flow
        const flowRes = await fetch(`${kratosUrl}/self-service/registration/api`)
        const newFlow = await flowRes.json()
        setFlowId(newFlow.id)
        setLoading(false)
        return
      }

      // Auto sign-in after successful registration
      // Get a fresh login flow
      const loginFlowRes = await fetch(`${kratosUrl}/self-service/login/api`)
      const loginFlow = await loginFlowRes.json()
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        flowId: loginFlow.id,
      })
      setLoading(false)
      if (result?.error) {
        setGlobalError("Registered! But auto sign-in failed — please log in manually.")
        router.push("/login")
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setGlobalError("Network error. Please try again.")
      setLoading(false)
    }
  }

  const strength = passwordStrength(password)
  const strengthColors = ["#2a2a4a", "#ef4444", "#f97316", "#eab308", "#7F77DD"]

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
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
          Create your account
        </h1>
        <p className="text-sm mb-8" style={{ color: "#8892a4" }}>
          Your personal knowledge base awaits
        </p>

        {globalError && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm border"
            style={{
              background: "#2d1a1a",
              borderColor: "#7a2020",
              color: "#f87171",
            }}
          >
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8892a4" }}>
                First name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="Setha"
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
                style={{ background: "#1a1a2e", borderColor: errors["traits.name.first"] ? "#ef4444" : "#2a2a4a", color: "#e0e0e0" }}
              />
              {errors["traits.name.first"] && (
                <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors["traits.name.first"]}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8892a4" }}>
                Last name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Vathanak"
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
                style={{ background: "#1a1a2e", borderColor: errors["traits.name.last"] ? "#ef4444" : "#2a2a4a", color: "#e0e0e0" }}
              />
              {errors["traits.name.last"] && (
                <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors["traits.name.last"]}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#8892a4" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
              style={{ background: "#1a1a2e", borderColor: errors["traits.email"] ? "#ef4444" : "#2a2a4a", color: "#e0e0e0" }}
            />
            {errors["traits.email"] && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors["traits.email"]}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#8892a4" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
              style={{ background: "#1a1a2e", borderColor: errors["password"] ? "#ef4444" : "#2a2a4a", color: "#e0e0e0" }}
            />
            {/* Strength bar */}
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{ background: strength >= seg ? "#7F77DD" : "#2a2a4a" }}
                />
              ))}
            </div>
            {errors["password"] && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>{errors["password"]}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !flowId}
            className="w-full py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50 mt-2"
            style={{ background: "#7F77DD", color: "#fff" }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "#8892a4" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-medium hover:underline" style={{ color: "#7F77DD" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
