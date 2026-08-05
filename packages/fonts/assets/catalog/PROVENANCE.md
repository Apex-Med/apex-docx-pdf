# Offline font catalog provenance

The browser reference implementation redistributes these unmodified static
TrueType files. Each family is licensed under the SIL Open Font License 1.1;
the exact upstream license is stored beside that family's files.

| Family              | Pinned source                                                                                                                                      | Bundled faces                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Inter               | `rsms/inter` release `v4.1`, `Inter-4.1.zip` SHA-256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`, files under `extras/ttf/` | Regular, Medium, SemiBold, Bold, Italic, Bold Italic |
| Bricolage Grotesque | `ateliertriay/bricolage@84745e5b96261ae5f8c6c856e262fe78d1d6efdd`                                                                                  | Regular, Medium, SemiBold, Bold                      |
| Instrument Sans     | `Instrument/instrument-sans@7fa22308a3d0c94ee2b3cd537a1196b65db34a3e`                                                                              | Regular, Bold, Italic, Bold Italic                   |
| Instrument Serif    | `Instrument/instrument-serif@65c0ef225f386a3c7e87570a4aa9cc0262c2fd81`                                                                             | Regular, Italic                                      |
| Geist Mono          | `vercel/geist-font@10dc7658f13c38a474cde201bb09a4617267545b`                                                                                       | Regular, Bold, Italic, Bold Italic                   |

The authoritative SHA-256 digest for every TTF is recorded in
`packages/fonts/src/catalog.ts` and verified by the catalog test. No WOFF or
WOFF2 file is presented to the renderer. Vite emits the application-owned TTFs
with the self-hosted build; the playground never discovers an OS font or fetches
a font from a third-party runtime service.
