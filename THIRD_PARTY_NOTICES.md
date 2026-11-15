# Third-party components and provenance

This repository contains the extracted adapter and frontend source. It does not contain HAPI or Codex binaries, copied Codex application bundles, generated protocol dumps, or code copied from the related projects. HAPI and Tailscale were used as deployment components; an independent token removes the runtime requirement for HAPI in this source edition.

Source imports these npm packages, pinned by the lockfile:

| Package | Role | License declared by upstream package |
| --- | --- | --- |
| markdown-it | Markdown parser | MIT |
| @mdit/plugin-katex | Formula rendering | MIT |
| @mdit/plugin-tasklist | Task lists | MIT |
| dompurify | HTML sanitization | Apache-2.0 OR MPL-2.0 |
| highlight.js | Code highlighting | BSD-3-Clause |
| ws | WebSocket transport | MIT |
| esbuild | Build tooling | MIT |
| jsdom | Test DOM | MIT |

KaTeX and its fonts are transitive build inputs. `npm run build` writes assets and preserves JavaScript legal comments; it also copies available upstream license files into `assets/licenses`. If distributing generated frontend assets, retain that directory and review the dependency licenses, including font notices. Source-only Git/ZIP archives exclude generated assets and node_modules; users install dependencies from the lockfile.

The list is an attribution guide, not a legal compatibility opinion. Open Codex UI's non-commercial terms are recorded in related work; none of its code is included or relicensed here. The MIT license covers this adapter's original source only.
