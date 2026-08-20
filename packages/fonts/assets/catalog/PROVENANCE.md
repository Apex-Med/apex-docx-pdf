# Offline font catalog provenance

The browser reference implementation redistributes static TrueType files for
the complete published weight inventory of each family. Each family is licensed
under the SIL Open Font License 1.1; the exact upstream license is stored beside
that family's files.

| Family              | Pinned Google Fonts source                                                     | Bundled weights and styles |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| Inter               | `google/fonts@e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/inter`              | 100–900, normal and italic |
| Instrument Sans     | `google/fonts@e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/instrumentsans`     | 400–700, normal and italic |
| Instrument Serif    | `google/fonts@e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/instrumentserif`    | 400, normal and italic     |
| Geist               | `google/fonts@e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/geist`              | 100–900, normal and italic |
| Geist Mono          | `google/fonts@e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/geistmono`          | 100–900, normal and italic |
| Bricolage Grotesque | `google/fonts@e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7/ofl/bricolagegrotesque` | 200–800, normal            |

Variable upstream TTFs were pinned at that commit and instantiated at their
default non-weight axes with FontTools 4.59.0. Inter uses optical size 14;
Instrument Sans uses width 100; and Bricolage Grotesque uses optical size 14
and width 100. The catalog records the SHA-256 digest of every generated static
TTF, and its test recalculates those digests from the shipped bytes.

The authoritative SHA-256 digest for every TTF is recorded in the generated
`packages/fonts/src/catalog-faces.generated.ts` inventory and verified by the
catalog test. No WOFF or WOFF2 file is presented to the renderer. Vite emits the
application-owned TTFs with the self-hosted build; the playground never
discovers an OS font or fetches a font from a third-party runtime service.
