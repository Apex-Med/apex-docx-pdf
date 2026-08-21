import { Show, UserButton } from "@clerk/tanstack-react-start"
import { ClientOnly, Link } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type SiteAuthControlsProps = Readonly<{
  className?: string
  onNavigate?: () => void
}>

export function SiteAuthControls({
  className,
  onNavigate,
}: SiteAuthControlsProps) {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()) {
    return null
  }

  return (
    <ClientOnly fallback={<AuthControlsFallback className={className} />}>
      <div className={cn("flex items-center gap-2", className)}>
        <Show when="signed-out">
          <Link
            to="/sign-in"
            search={{ redirect: "/app" }}
            className={cn(
              buttonVariants({ size: "sm" }),
              "tracking-normal normal-case"
            )}
            onClick={onNavigate}
          >
            Log in / Sign up
          </Link>
        </Show>
        <Show when="signed-in">
          <Link
            to="/app"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "tracking-normal normal-case"
            )}
            onClick={onNavigate}
          >
            Open app
          </Link>
          <UserButton />
        </Show>
      </div>
    </ClientOnly>
  )
}

function AuthControlsFallback({
  className,
}: Pick<SiteAuthControlsProps, "className">) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link
        to="/sign-in"
        search={{ redirect: "/app" }}
        className={cn(
          buttonVariants({ size: "sm" }),
          "tracking-normal normal-case"
        )}
      >
        Log in / Sign up
      </Link>
    </div>
  )
}
