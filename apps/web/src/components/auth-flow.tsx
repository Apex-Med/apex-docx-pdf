import {
  useClerk,
  useSignIn,
  useSignUp,
} from "@clerk/tanstack-react-start"
import { ArrowLeft01Icon, GoogleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Spinner } from "@workspace/ui/components/spinner"
import { useEffect, useState } from "react"

import { ApexLogo } from "@/components/apex-logo"
import {
  DEFAULT_AUTHENTICATED_REDIRECT,
  sanitizeRedirect,
} from "@/lib/auth-redirect"

const AUTH_REDIRECT_STORAGE_KEY = "apex-auth-redirect"

type AuthStep =
  | "identifier"
  | "signInPassword"
  | "signUpPassword"
  | "name"
  | "verifyEmail"

type DisplayableError = {
  code?: string
  errors?: DisplayableError[]
  longMessage?: string
  message?: string
}

function firstClerkError(error: unknown): DisplayableError | undefined {
  if (!error || typeof error !== "object") return undefined
  const displayable = error as DisplayableError
  return displayable.errors?.[0] ?? displayable
}

function clerkErrorMessage(error: unknown, fallback: string) {
  const displayable = firstClerkError(error)
  if (!displayable) return fallback
  return displayable.longMessage ?? displayable.message ?? fallback
}

function clerkErrorCode(error: unknown) {
  return firstClerkError(error)?.code
}

function storeRedirect(redirectTo: string) {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(AUTH_REDIRECT_STORAGE_KEY, redirectTo)
}

export function readStoredRedirect() {
  if (typeof window === "undefined") {
    return DEFAULT_AUTHENTICATED_REDIRECT
  }

  return sanitizeRedirect(
    window.sessionStorage.getItem(AUTH_REDIRECT_STORAGE_KEY)
  )
}

export function AuthFlow() {
  const clerk = useClerk()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: unknown }
  const {
    signIn,
    errors: signInErrors,
    fetchStatus: signInStatus,
  } = useSignIn()
  const { signUp, fetchStatus: signUpStatus } = useSignUp()
  const [step, setStep] = useState<AuthStep>("identifier")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const redirectTo = sanitizeRedirect(search.redirect)
  const pending =
    !clerk.loaded ||
    signInStatus === "fetching" ||
    signUpStatus === "fetching"

  useEffect(() => {
    storeRedirect(redirectTo)
  }, [redirectTo])

  useEffect(() => {
    const authError =
      signInErrors.global?.[0] ?? signInErrors.fields.identifier
    if (authError) {
      setError(clerkErrorMessage(authError, "Unable to continue."))
    }
  }, [signInErrors])

  const finish = async (
    finalize: (params: {
      navigate: (args: { decorateUrl: (url: string) => string }) => void
    }) => Promise<{ error: unknown }>
  ) => {
    const { error: finalizeError } = await finalize({
      navigate: ({ decorateUrl }) => {
        window.location.assign(decorateUrl(redirectTo))
      },
    })
    if (finalizeError) throw finalizeError
  }

  const handleIdentifier = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setError("Enter your email address.")
      return
    }

    setError(null)
    const { error: identifyError } = await signIn.create({
      identifier: cleanEmail,
    })

    if (!identifyError) {
      setEmail(cleanEmail)
      setStep("signInPassword")
      return
    }

    if (clerkErrorCode(identifyError) === "form_identifier_not_found") {
      await signIn.reset()
      setEmail(cleanEmail)
      setStep("signUpPassword")
      return
    }

    setError(clerkErrorMessage(identifyError, "Unable to continue."))
  }

  const handleExistingPassword = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault()
    if (!password) {
      setError("Enter your password.")
      return
    }

    setError(null)
    const { error: passwordError } = await signIn.password({ password })
    if (passwordError) {
      setError(clerkErrorMessage(passwordError, "Unable to sign in."))
      return
    }
    if (signIn.status !== "complete") {
      setError("This account needs an additional sign-in step.")
      return
    }
    await finish((params) => signIn.finalize(params))
  }

  const handleNewPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.")
      return
    }
    setError(null)
    setStep("name")
  }

  const continueSignUp = async () => {
    if (signUp.status === "complete") {
      await finish((params) => signUp.finalize(params))
      return
    }

    if (signUp.unverifiedFields.includes("email_address")) {
      const { error: sendError } = await signUp.verifications.sendEmailCode()
      if (sendError) {
        setError(
          clerkErrorMessage(sendError, "Unable to send a verification code.")
        )
        return
      }
      setStep("verifyEmail")
      return
    }

    setError("This account needs an additional verification step.")
  }

  const handleName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanFirstName = firstName.trim()
    const cleanLastName = lastName.trim()
    if (!cleanFirstName || !cleanLastName) {
      setError("Enter your first and last name.")
      return
    }

    setError(null)
    const { error: createError } = await signUp.password({
      emailAddress: email,
      password,
      firstName: cleanFirstName,
      lastName: cleanLastName,
    })
    if (createError) {
      setError(clerkErrorMessage(createError, "Unable to create your account."))
      return
    }
    await continueSignUp()
  }

  const handleVerification = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault()
    const code = verificationCode.trim()
    if (!code) {
      setError("Enter the verification code sent to your email.")
      return
    }

    setError(null)
    const { error: verifyError } = await signUp.verifications.verifyEmailCode({
      code,
    })
    if (verifyError) {
      setError(clerkErrorMessage(verifyError, "Unable to verify that code."))
      return
    }
    await continueSignUp()
  }

  const handleGoogle = async () => {
    if (!clerk.loaded) return
    setError(null)
    storeRedirect(redirectTo)
    try {
      await Promise.all([signIn.reset(), signUp.reset()])
      const { error: googleError } = await signIn.sso({
        strategy: "oauth_google",
        redirectUrl: redirectTo,
        redirectCallbackUrl: "/sso-callback",
      })
      if (googleError) throw googleError
    } catch (googleError: unknown) {
      setError(
        clerkErrorMessage(
          googleError,
          "Google sign-in is unavailable right now."
        )
      )
    }
  }

  const goBack = async () => {
    setError(null)
    setPassword("")
    setVerificationCode("")
    if (step === "name") {
      setStep("signUpPassword")
      return
    }
    if (step === "verifyEmail") {
      setStep("name")
      return
    }
    await Promise.all([signIn.reset(), signUp.reset()])
    setStep("identifier")
  }

  const title =
    step === "identifier"
      ? "Welcome to Apex"
      : step === "signInPassword"
        ? "Enter your password"
        : step === "signUpPassword"
          ? "Create a password"
          : step === "name"
            ? "Tell us your name"
            : "Check your email"
  const description =
    step === "identifier"
      ? "Sign in or create your account to continue."
      : step === "signInPassword"
        ? `Continue as ${email}`
        : step === "signUpPassword"
          ? `Create an account for ${email}`
          : step === "name"
            ? "This is how your name will appear in Apex."
            : `Enter the code we sent to ${email}.`

  return (
    <Card className="w-full max-w-md ring-border">
      <CardHeader>
        {step !== "identifier" ? (
          <Button
            aria-label="Go back"
            className="mb-3 -ml-2 w-fit tracking-normal normal-case"
            disabled={pending}
            onClick={() => void goBack()}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
            Back
          </Button>
        ) : null}
        <div className="mb-4 flex items-center gap-3">
          <ApexLogo className="size-8 text-foreground" />
          <p className="text-sm font-semibold tracking-tight">Apex DOCX PDF</p>
        </div>
        <CardTitle className="font-heading text-2xl tracking-tight normal-case">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent>
        {step === "identifier" ? (
          <div className="flex flex-col gap-5">
            <Button
              className="w-full tracking-normal normal-case"
              disabled={pending}
              onClick={() => void handleGoogle()}
              size="lg"
              variant="outline"
            >
              <HugeiconsIcon icon={GoogleIcon} strokeWidth={1.8} />
              Continue with Google
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs tracking-wide text-muted-foreground uppercase">
                or
              </span>
              <Separator className="flex-1" />
            </div>

            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => void handleIdentifier(event)}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  autoComplete="email"
                  autoFocus
                  disabled={pending}
                  id="email"
                  inputMode="email"
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setError(null)
                  }}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
              <Button
                className="w-full tracking-normal normal-case"
                disabled={pending}
                size="lg"
                type="submit"
              >
                {pending ? <Spinner /> : "Continue"}
              </Button>
            </form>
          </div>
        ) : null}

        {step === "signInPassword" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleExistingPassword(event)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="current-password"
                autoFocus
                disabled={pending}
                id="password"
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError(null)
                }}
                type="password"
                value={password}
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            <Button
              className="w-full tracking-normal normal-case"
              disabled={pending}
              size="lg"
              type="submit"
            >
              {pending ? <Spinner /> : "Sign in"}
            </Button>
          </form>
        ) : null}

        {step === "signUpPassword" ? (
          <form className="flex flex-col gap-4" onSubmit={handleNewPassword}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">Password</Label>
              <Input
                autoComplete="new-password"
                autoFocus
                disabled={pending}
                id="newPassword"
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError(null)
                }}
                type="password"
                value={password}
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            <Button
              className="w-full tracking-normal normal-case"
              disabled={pending}
              size="lg"
              type="submit"
            >
              Continue
            </Button>
          </form>
        ) : null}

        {step === "name" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleName(event)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  autoComplete="given-name"
                  autoFocus
                  disabled={pending}
                  id="firstName"
                  onChange={(event) => {
                    setFirstName(event.target.value)
                    setError(null)
                  }}
                  value={firstName}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  autoComplete="family-name"
                  disabled={pending}
                  id="lastName"
                  onChange={(event) => {
                    setLastName(event.target.value)
                    setError(null)
                  }}
                  value={lastName}
                />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              className="w-full tracking-normal normal-case"
              disabled={pending}
              size="lg"
              type="submit"
            >
              {pending ? <Spinner /> : "Create account"}
            </Button>
          </form>
        ) : null}

        {step === "verifyEmail" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleVerification(event)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="verificationCode">Verification code</Label>
              <Input
                autoComplete="one-time-code"
                autoFocus
                disabled={pending}
                id="verificationCode"
                inputMode="numeric"
                onChange={(event) => {
                  setVerificationCode(event.target.value)
                  setError(null)
                }}
                value={verificationCode}
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            <Button
              className="w-full tracking-normal normal-case"
              disabled={pending}
              size="lg"
              type="submit"
            >
              {pending ? <Spinner /> : "Verify email"}
            </Button>
          </form>
        ) : null}

        <div id="clerk-captcha" />

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          <button
            className="underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => void navigate({ to: "/" })}
            type="button"
          >
            Back to home
          </button>
        </p>
      </CardContent>
    </Card>
  )
}
