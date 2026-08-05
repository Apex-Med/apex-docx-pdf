import { cn } from "@workspace/ui/lib/utils"

type ApexLogoProps = Readonly<{
  className?: string
  title?: string
}>

export function ApexLogo({
  className,
  title = "Apex DOCX PDF",
}: ApexLogoProps) {
  return (
    <svg
      viewBox="0 0 725 725"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8 shrink-0", className)}
      role="img"
    >
      <title>{title}</title>
      <path
        d="M425 0H375V350H725V300H525C469.772 300 425 255.228 425 200V0Z"
        fill="currentColor"
      />
      <path
        d="M300 725H350L350 375L0 375V425L200 425C255.228 425 300 469.772 300 525V725Z"
        fill="currentColor"
      />
    </svg>
  )
}
