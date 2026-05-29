import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const identityId: string = body?.identity?.id ?? "unknown"
    const email: string = body?.identity?.traits?.email ?? "unknown"

    console.log("[kratos/after-register] identity.id:", identityId, "email:", email)

    // Phase 4: call createUserVault(identityId) here to provision a CouchDB
    // database for the new user and store credentials in their identity metadata.

    return NextResponse.json({ status: "ok" })
  } catch (err) {
    console.error("[kratos/after-register] error:", err)
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
}
