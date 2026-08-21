import { auth } from "@clerk/tanstack-react-start/server"
import { createServerFn } from "@tanstack/react-start"

export const fetchAuthState = createServerFn().handler(async () => {
  const { isAuthenticated, userId } = await auth()
  return {
    isAuthenticated,
    userId: userId ?? null,
  }
})
