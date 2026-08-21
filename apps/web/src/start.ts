import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import { createStart } from "@tanstack/react-start"

const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim()

export const startInstance = createStart(() => {
  return {
    requestMiddleware: clerkSecretKey ? [clerkMiddleware()] : [],
  }
})
