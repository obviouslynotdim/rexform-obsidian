import { NextRequest, NextResponse } from "next/server"
import { kratosFrontend } from "@/lib/kratos"

export async function POST(req: NextRequest) {
  try {
    const { flowId, email, password, firstName, lastName } = await req.json()
    const result = await kratosFrontend.updateRegistrationFlow({
      flow: flowId,
      updateRegistrationFlowBody: {
        method: "password",
        password,
        traits: { email, name: { first: firstName, last: lastName } },
      },
    })
    return NextResponse.json(result.data)
  } catch (err: any) {
    const status = err?.response?.status ?? 500
    const data = err?.response?.data ?? { error: { message: err.message } }
    return NextResponse.json(data, { status })
  }
}
