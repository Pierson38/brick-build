# 07 — Official sources and rights constraints

**Verification status:** 2026-11-03. This document is not legal advice.

## Technical sources

1. LDraw OMR (community replicas of LEGO sets): https://library.ldraw.org/omr
2. LDraw specification (type 1, STEP, MPD): https://www.ldraw.org/article/218.html
3. OMR standard: https://library.ldraw.org/documentation/official-model-repository-omr-standards/official-model-repository-omr-specification
4. OMR rules and license of contributed models: https://www.ldraw.org/docs-main/official-model-repository-omr/rules-and-procedures-for-the-official-model-repository.html
5. Three.js LDrawLoader: https://threejs.org/docs/pages/LDrawLoader.html
6. Three.js LDraw demo: https://threejs.org/examples/webgl_loader_ldraw.html
7. PDF.js documentation: https://mozilla.github.io/pdf.js/getting_started/
8. LEGO, instructions: https://www.lego.com/fr-fr/service/building-instructions
9. LEGO help on downloading PDFs: https://www.lego.com/en-us/service/help-topics/article/how-to-download-building-instructions-online

## Law and trademarks

- LEGO Fair Play: https://www.lego.com/en-us/legal/notices-and-policies/fair-play
- LEGO, personal projects and intellectual property: https://www.lego.com/en-gr/service/help-topics/article/using-lego-products-for-personal-projects

## Mandatory distinctions

- **LDraw OMR is not official LEGO**: "official" means models derived from existing sets, submitted by the community.
- Recent OMR files normally display a CC BY 4.0 license, and some legacy ones CC BY 2.0/4.0 depending on the submission rules; read **the license written in the file actually downloaded**. LDraw parts and the model file may be subject to separate conditions.
- A license on the file created by a contributor does not guarantee that they hold all possible rights over the LEGO set, its illustrations, its characters, or third-party franchises.
- Official instructions can be downloaded for free by the user from LEGO.com; this **does not grant** the right to redistribute them in bulk or to incorporate them into a public application.
- Running the game for oneself alone on localhost reduces the risk of distribution, but **does not automatically erase** copyright, trademarks, license terms, or terms of service.

## Design rules for the project

- The application imports locally files voluntarily provided by the user.
- Do not put copies of LEGO instructions or third-party set models in the repository, public builds, automated tests, or a CDN.
- Do not automatically scrape the OMR or LEGO.com; the choice and download of files remain on the user's side.
- Keep as metadata: file name, stated author, declared license, and source when the user provides them.
- Do not present the application as approved by or affiliated with LEGO.
- Consider a specific legal review **before** any public sharing, multi-user service, or monetization.
