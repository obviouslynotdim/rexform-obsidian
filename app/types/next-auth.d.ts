import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    kratosSessionToken?: string
  }
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
    }
    kratosSessionToken?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
    kratosSessionToken?: string
  }
}
