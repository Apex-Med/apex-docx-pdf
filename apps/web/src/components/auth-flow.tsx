import {
  useAuth,
  useClerk,
  useSignIn,
  useSignUp,
} from "@clerk/tanstack-react-start"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useNavigate } from "@tanstack/react-router"
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
import { useCallback, useEffect, useRef, useState } from "react"

import { ApexLogo } from "@/components/apex-logo"
import {
  consumeStoredRedirect,
  destinationForSession,
  navigateAfterClerkUrl,
  sanitizeRedirect,
  storeAuthRedirect,
} from "@/lib/auth-redirect"

type AuthStep =
  | "identifier"
  | "signInPassword"
  | "signInGoogle"
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

function isAlreadySignedInError(error: unknown) {
  const code = clerkErrorCode(error)
  if (code === "identifier_already_signed_in" || code === "session_exists") {
    return true
  }

  return clerkErrorMessage(error, "")
    .toLowerCase()
    .includes("already signed in")
}

function hasStrategy(
  factors: ReadonlyArray<{ strategy: string }>,
  strategy: string
) {
  return factors.some((factor) => factor.strategy === strategy)
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44c-.28 1.5-1.12 2.77-2.39 3.63v3.02h3.87c2.26-2.08 3.57-5.14 3.57-8.68z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.02c-1.08.72-2.46 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.27v3.12C3.25 21.3 7.31 24 12 24z"
        fill="#34A853"
      />
      <path
        d="M5.25 14.25c-.24-.72-.38-1.49-.38-2.25s.14-1.53.38-2.25V6.63H1.27C.46 8.24 0 10.06 0 12s.46 3.76 1.27 5.37l3.98-3.12z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l3.98 3.12C6.2 6.87 8.86 4.75 12 4.75z"
        fill="#EA4335"
      />
    </svg>
  )
}

type AuthFlowProps = Readonly<{
  redirectTo?: string
}>

export function AuthFlow({ redirectTo: redirectToProp }: AuthFlowProps) {
  const clerk = useClerk()
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
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
  const redirectTo = sanitizeRedirect(redirectToProp)
  const didResumeRef = useRef(false)
  const pending =
    !clerk.loaded || signInStatus === "fetching" || signUpStatus === "fetching"

  useEffect(() => {
    storeAuthRedirect(redirectTo)
  }, [redirectTo])

  useEffect(() => {
    const authError = signInErrors.global?.[0] ?? signInErrors.fields.identifier
    if (authError) {
      if (isAlreadySignedInError(authError)) return
      // Missing accounts are the sign-up path, not a user-facing failure.
      if (clerkErrorCode(authError) === "form_identifier_not_found") return
      setError(clerkErrorMessage(authError, "Unable to continue."))
    }
  }, [signInErrors])

  const goToApp = useCallback(
    (url: string) => {
      consumeStoredRedirect()
      navigateAfterClerkUrl(url, (href) => {
        void navigate({ href })
      })
    },
    [navigate]
  )

  useEffect(() => {
    if (!clerk.loaded) return
    if (clerk.session?.currentTask) {
      navigateAfterClerkUrl(
        destinationForSession(clerk.session, redirectTo),
        (href) => {
          void navigate({ href })
        }
      )
      return
    }
    if (!isSignedIn) return
    goToApp(redirectTo)
  }, [clerk.loaded, clerk.session, goToApp, isSignedIn, navigate, redirectTo])

  const finish = useCallback(
    async (
      finalize: (params: {
        navigate: (args: {
          decorateUrl: (url: string) => string
          session?: { currentTask?: { key: string } | null } | null
        }) => void
      }) => Promise<{ error: unknown }>
    ) => {
      const { error: finalizeError } = await finalize({
        navigate: ({ decorateUrl, session }) => {
          const destination = destinationForSession(session, redirectTo)
          if (!session?.currentTask) consumeStoredRedirect()
          navigateAfterClerkUrl(decorateUrl(destination), (href) => {
            void navigate({ href })
          })
        },
      })
      if (finalizeError) throw finalizeError
    },
    [navigate, redirectTo]
  )

  const continueToApp = useCallback(
    async (sessionId?: string) => {
      if (sessionId && clerk.session?.id !== sessionId) {
        await clerk.setActive({
          navigate: ({ decorateUrl, session }) => {
            const destination = destinationForSession(session, redirectTo)
            if (!session?.currentTask) consumeStoredRedirect()
            navigateAfterClerkUrl(decorateUrl(destination), (href) => {
              void navigate({ href })
            })
          },
          session: sessionId,
        })
        return
      }
      if (clerk.session?.currentTask) {
        navigateAfterClerkUrl(
          destinationForSession(clerk.session, redirectTo),
          (href) => {
            void navigate({ href })
          }
        )
        return
      }
      goToApp(redirectTo)
    },
    [clerk, goToApp, navigate, redirectTo]
  )

  const resumeExistingSession = useCallback(
    async (error?: unknown) => {
      const sessionId =
        signIn.existingSession?.sessionId ??
        signUp.existingSession?.sessionId ??
        clerk.session?.id
      if (!sessionId && !isAlreadySignedInError(error) && !isSignedIn) {
        return false
      }

      try {
        await continueToApp(sessionId)
        return true
      } catch (resumeError) {
        setError(
          clerkErrorMessage(resumeError, "Unable to continue your session.")
        )
        return true
      }
    },
    [clerk.session?.id, continueToApp, isSignedIn, signIn, signUp]
  )

  useEffect(() => {
    const authError = signInErrors.global?.[0] ?? signInErrors.fields.identifier
    if (!authError || !isAlreadySignedInError(authError)) return
    void resumeExistingSession(authError)
  }, [resumeExistingSession, signInErrors])

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

    if (identifyError) {
      if (await resumeExistingSession(identifyError)) return
      if (clerkErrorCode(identifyError) === "form_identifier_not_found") {
        await Promise.all([signIn.reset(), signUp.reset()])
        setEmail(cleanEmail)
        setPassword("")
        setError(null)
        setStep("signUpPassword")
        return
      }
      setError(clerkErrorMessage(identifyError, "Unable to continue."))
      return
    }

    setEmail(cleanEmail)

    if (await resumeExistingSession()) return

    if (hasStrategy(signIn.supportedFirstFactors, "password")) {
      setStep("signInPassword")
      return
    }
    if (hasStrategy(signIn.supportedFirstFactors, "oauth_google")) {
      setStep("signInGoogle")
      return
    }
    if (signIn.isTransferable) {
      await Promise.all([signIn.reset(), signUp.reset()])
      setError(null)
      setStep("signUpPassword")
      return
    }
    setError("This account needs a different sign-in method.")
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
      if (await resumeExistingSession(passwordError)) return
      setError(clerkErrorMessage(passwordError, "Unable to sign in."))
      if (
        clerkErrorCode(passwordError) === "form_param_nil" ||
        clerkErrorCode(passwordError) === "strategy_for_user_invalid"
      ) {
        if (hasStrategy(signIn.supportedFirstFactors, "oauth_google")) {
          setStep("signInGoogle")
        }
      }
      return
    }
    if (signIn.status !== "complete") {
      setError("This account needs an additional sign-in step.")
      return
    }
    await finish((params) => signIn.finalize(params))
  }

  const continueSignUp = useCallback(async () => {
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
  }, [finish, signUp])

  const handleNewPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.")
      return
    }
    setError(null)
    const { error: createError } = await signUp.password({
      emailAddress: email,
      password,
    })
    if (createError) {
      if (await resumeExistingSession(createError)) return
      if (clerkErrorCode(createError) === "form_identifier_exists") {
        await signUp.reset()
        const { error: existingError } = await signIn.create({
          identifier: email,
        })
        if (existingError) {
          if (await resumeExistingSession(existingError)) return
          setError(clerkErrorMessage(existingError, "Unable to continue."))
          return
        }
        setStep("signInPassword")
        return
      }
      setError(clerkErrorMessage(createError, "Unable to create your account."))
      return
    }
    if (
      signUp.missingFields.includes("first_name") ||
      signUp.missingFields.includes("last_name")
    ) {
      setStep("name")
      return
    }
    await continueSignUp()
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
    const { error: createError } = await signUp.update({
      firstName: cleanFirstName,
      lastName: cleanLastName,
    })
    if (createError) {
      setError(clerkErrorMessage(createError, "Unable to save your name."))
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
    const nativeSignIn = clerk.client?.signIn
    if (!nativeSignIn) {
      setError("Google sign-in is unavailable right now.")
      return
    }

    setError(null)
    storeAuthRedirect(redirectTo)
    const callbackUrl = `${window.location.origin}/sso-callback`
    try {
      // Use the live SignIn resource, not the Future wrapper. reset()/sso() on
      // a discarded Future either no-ops or POSTs a relative redirect_url that
      // Clerk rejects with 400. continueSignIn: false starts a fresh OAuth
      // attempt even if a password sign-in is already in progress.
      await nativeSignIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: callbackUrl,
        redirectUrlComplete: callbackUrl,
        continueSignIn: false,
      })
    } catch (googleError: unknown) {
      if (await resumeExistingSession(googleError)) return
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
    setVerificationCode("")
    if (step === "name" && password) {
      setStep("signUpPassword")
      return
    }
    if (step === "verifyEmail") {
      if (firstName || lastName) {
        setStep("name")
        return
      }
      setStep("signUpPassword")
      return
    }
    setPassword("")
    await Promise.all([signIn.reset(), signUp.reset()])
    setStep("identifier")
  }

  useEffect(() => {
    if (!clerk.loaded || didResumeRef.current) return
    if (signInStatus === "fetching" || signUpStatus === "fetching") return
    didResumeRef.current = true

    const storedEmail = signUp.emailAddress ?? signIn.identifier ?? ""
    if (storedEmail) setEmail(storedEmail)
    if (signUp.firstName) setFirstName(signUp.firstName)
    if (signUp.lastName) setLastName(signUp.lastName)

    if (isSignedIn || clerk.session) return

    if (signUp.status === "complete") {
      void finish((params) => signUp.finalize(params))
      return
    }

    if (signUp.status === "missing_requirements") {
      if (signUp.missingFields.includes("password")) {
        setStep("signUpPassword")
        return
      }
      if (
        signUp.missingFields.includes("first_name") ||
        signUp.missingFields.includes("last_name")
      ) {
        setStep("name")
        return
      }
      if (signUp.unverifiedFields.includes("email_address")) {
        setStep("verifyEmail")
        return
      }
      void Promise.all([signIn.reset(), signUp.reset()]).then(() => {
        setError(null)
        setStep("identifier")
      })
      return
    }

    if (signIn.status === "complete") {
      void finish((params) => signIn.finalize(params))
      return
    }

    if (signIn.status === "needs_first_factor") {
      if (hasStrategy(signIn.supportedFirstFactors, "password")) {
        setStep("signInPassword")
        return
      }
      if (hasStrategy(signIn.supportedFirstFactors, "oauth_google")) {
        setStep("signInGoogle")
      }
    }
  }, [
    clerk.loaded,
    clerk.session,
    finish,
    isSignedIn,
    signIn,
    signInStatus,
    signUp,
    signUpStatus,
  ])

  const title =
    step === "identifier"
      ? "Welcome to Apex"
      : step === "signInPassword"
        ? "Enter your password"
        : step === "signInGoogle"
          ? "Continue with Google"
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
        : step === "signInGoogle"
          ? `This account uses Google. Continue as ${email}.`
          : step === "signUpPassword"
            ? `Create an account for ${email}`
            : step === "name"
              ? "This is how your name will appear in Apex."
              : `Enter the code we sent to ${email}.`

  if (clerk.loaded && isSignedIn) {
    return (
      <p className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner />
        Continuing…
      </p>
    )
  }

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
              type="button"
              variant="outline"
            >
              {pending ? <Spinner /> : <GoogleMark />}
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
                  name="email_address"
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
                name="password"
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
            {hasStrategy(signIn.supportedFirstFactors, "oauth_google") ? (
              <Button
                className="w-full tracking-normal normal-case"
                disabled={pending}
                onClick={() => void handleGoogle()}
                size="lg"
                type="button"
                variant="outline"
              >
                {pending ? <Spinner /> : <GoogleMark />}
                Continue with Google
              </Button>
            ) : null}
          </form>
        ) : null}

        {step === "signInGoogle" ? (
          <div className="flex flex-col gap-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              className="w-full tracking-normal normal-case"
              disabled={pending}
              onClick={() => void handleGoogle()}
              size="lg"
              type="button"
            >
              {pending ? <Spinner /> : <GoogleMark />}
              Continue with Google
            </Button>
          </div>
        ) : null}

        {step === "signUpPassword" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleNewPassword(event)}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">Password</Label>
              <Input
                autoComplete="new-password"
                autoFocus
                disabled={pending}
                id="newPassword"
                name="password"
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
                  name="first_name"
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
                  name="last_name"
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
                name="code"
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
