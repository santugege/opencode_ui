---
name: "imagegen"
description: "Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or transparent-background cutouts. Use when opencode should create a brand-new image, transform an existing image, or derive visual variants from references, and the output should be a bitmap asset rather than repo-native code or vector. Do not use when the task is better handled by editing existing SVG/vector/code-native assets, extending an established icon or logo system, or building the visual directly in HTML/CSS/canvas."
---

# Image Generation Skill

Generates or edits images for the current project (for example website assets, game assets, UI mockups, product mockups, wireframes, logo design, photorealistic images, or infographics).

## Execution mode and rules

In opencode, use the bundled `scripts/image_gen.py` CLI for image generation and editing.

The CLI exposes three subcommands:

- `generate`
- `edit`
- `generate-batch`

Rules:
- Use the bundled `scripts/image_gen.py` workflow for normal image generation, editing, transparent-background workflows, and batches.
- Do not create one-off SDK runners.
- For live API calls, an API key is required. Prefer `IMAGE_GEN_API_KEY` or `OPENAI_API_KEY`; do not ask the user to paste the full key in chat.
- For OpenAI-compatible gateways, use `--base-url`, `IMAGE_GEN_BASE_URL`, or `OPENAI_BASE_URL`.
- Default to `gpt-image-2` for new CLI/API workflows unless the request needs true model-native transparent output.
- If the user explicitly asks for a transparent image/background, use `gpt-image-2` with a flat removable chroma-key background first, then remove it locally with the installed helper at `scripts/remove_chroma_key.py` in this skill directory.
- Never silently switch from CLI `gpt-image-2` to CLI `gpt-image-1.5`. Treat this as a model/path downgrade and ask the user before doing it, unless the user has already explicitly requested `gpt-image-1.5` or true/native transparency.
- If a transparent request appears too complex for clean chroma-key removal, asks for true/native transparency, or local removal fails validation, explain that true transparency requires `gpt-image-1.5 --background transparent --output-format png` because `gpt-image-2` does not support `background=transparent`, then ask whether to proceed.
- For many distinct assets, use `generate-batch` with one prompt/job per asset. Do not use `n` as a substitute for distinct prompts.

Output policy:
- Use `--out` for a single explicit output file or `--out-dir` for generated batches/variants.
- Save-path precedence:
  1. If the user names a destination, move or copy the selected output there.
  2. If the image is meant for the current project, move or copy the final selected image into the workspace before finishing.
  3. If the image is only for preview or brainstorming, write it under `output/imagegen/` by default and report the path.
- Never reference a project asset path unless that file actually exists in the workspace.
- Do not overwrite an existing asset unless the user explicitly asked for replacement; otherwise create a sibling versioned filename such as `hero-v2.png` or `item-icon-edited.png`.

Shared prompt guidance lives in `references/prompting.md` and `references/sample-prompts.md`.

CLI docs/resources:
- `references/cli.md`
- `references/image-api.md`
- `references/opencode-network.md`
- `scripts/image_gen.py`

Local post-processing helper:
- `scripts/remove_chroma_key.py` in this skill directory (for a global install, usually `~/.config/opencode/skills/imagegen/scripts/remove_chroma_key.py`): removes a flat chroma-key background from a generated image and writes a PNG/WebP with alpha. Prefer auto-key sampling, soft matte, and despill for antialiased edges.

## When to use
- Generate a new image (concept art, product shot, cover, website hero)
- Generate a new image using one or more reference images for style, composition, or mood
- Edit an existing image (inpainting, lighting or weather transformations, background replacement, object removal, compositing, transparent background)
- Produce many assets or variants for one task

## When not to use
- Extending or matching an existing SVG/vector icon set, logo system, or illustration library inside the repo
- Creating simple shapes, diagrams, wireframes, or icons that are better produced directly in SVG, HTML/CSS, or canvas
- Making a small project-local asset edit when the source file already exists in an editable native format
- Any task where the user clearly wants deterministic code-native output instead of a generated bitmap

## Decision tree

Think about two separate questions:

1. **Intent:** is this a new image or an edit of an existing image?
2. **Execution strategy:** is this one asset or many assets/variants?

Intent:
- If the user wants to modify an existing image while preserving parts of it, treat the request as **edit**.
- If the user provides images only as references for style, composition, mood, or subject guidance, treat the request as **generate**.
- If the user provides no images, treat the request as **generate**.

Edit semantics:
- CLI edit mode requires one or more local image file paths via repeated `--image` arguments.
- If the user provides an image attachment but no local path is available, ask for or derive a workspace-local file before using `edit`.
- If the user supplies a mask, pass it with `--mask` and repeat invariants in the prompt.
- For edits, preserve invariants aggressively and save non-destructively by default.

Execution strategy:
- Use `generate` for one new asset and `edit` for one or more existing local image files.
- Use `generate-batch` when the user asks for many distinct assets or prompts.
- For many distinct assets, do not use `n` as a substitute for separate prompts. `n` is for variants of one prompt; distinct assets need distinct CLI `generate-batch` jobs.

Assume the user wants a new image unless they clearly ask to change an existing one.

## Workflow
1. Use `scripts/image_gen.py` as the execution path.
2. Decide the intent: `generate` or `edit`.
3. Decide whether the output is preview-only or meant to be consumed by the current project.
4. Decide the execution strategy: single `generate`/`edit` call vs `generate-batch`.
5. Collect inputs up front: prompt(s), exact text (verbatim), constraints/avoid list, and any input images.
6. For every input image, label its role explicitly:
   - reference image
   - edit target
   - supporting insert/style/compositing input
7. If the edit target is only an attachment and no local path is available, obtain a workspace-local file path before calling `edit`.
8. If the user asked for a photo, illustration, sprite, product image, banner, or other explicitly raster-style asset, use the CLI rather than substituting SVG/HTML/CSS placeholders. If the request is for an icon, logo, or UI graphic that should match existing repo-native SVG/vector/code assets, prefer editing those directly instead.
9. Augment the prompt based on specificity:
   - If the user's prompt is already specific and detailed, normalize it into a clear spec without adding creative requirements.
   - If the user's prompt is generic, add tasteful augmentation only when it materially improves output quality.
10. Build the CLI command using `--prompt` or `--prompt-file`, output path flags, and any required execution controls.
11. For transparent-output requests, follow the transparent image guidance below: generate with `gpt-image-2` on a flat chroma-key background, run the installed `scripts/remove_chroma_key.py` helper, and validate the alpha result before using it. If this path looks unsuitable or validation fails, ask before switching to `gpt-image-1.5` true transparency.
12. Inspect outputs and validate: subject, style, composition, text accuracy, and invariants/avoid items.
13. Iterate with a single targeted change, then re-check.
14. For preview-only work, save under `output/imagegen/` and report the path.
15. For project-bound work, move or copy the selected artifact into the workspace and update any consuming code or references.
16. For batches or multi-asset requests, persist every requested deliverable final in the workspace unless the user explicitly asked to keep outputs preview-only. Discarded variants do not need to be kept unless requested.
17. Use the CLI docs for model, quality, size, `input_fidelity`, masks, output format, output paths, and network setup.
18. Report the final saved path(s), plus the final prompt or prompt set and the model/path used.

## Transparent image requests

Transparent-image requests use the CLI first. Because `gpt-image-2` does not support true transparent-background output, create a removable chroma-key source image and then convert the key color to alpha locally.

Default sequence:
1. Use `scripts/image_gen.py generate` with `gpt-image-2` to generate the requested subject on a perfectly flat solid chroma-key background.
2. Choose a key color that is unlikely to appear in the subject: default `#00ff00`, use `#ff00ff` for green subjects, and avoid `#0000ff` for blue subjects.
3. Write the source image into the workspace or `tmp/imagegen/`.
4. Run the installed helper path, not a project-relative script path:
   ```bash
   python "<skill-dir>/scripts/remove_chroma_key.py" \
     --input <source> \
     --out <final.png> \
     --auto-key border \
     --soft-matte \
     --transparent-threshold 12 \
     --opaque-threshold 220 \
     --despill
   ```
5. Validate that the output has an alpha channel, transparent corners, plausible subject coverage, and no obvious key-color fringe. If a thin fringe remains, retry once with `--edge-contract 1`; use `--edge-feather 0.25` only when the edge is visibly stair-stepped and the subject is not shiny or reflective.
6. Save the final alpha PNG/WebP in the project if the asset is project-bound. Never reference a project transparent asset unless the file exists in the workspace.

Prompt transparent requests like this:

```text
Create the requested subject on a perfectly flat solid #00ff00 chroma-key background for background removal.
The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.
Keep the subject fully separated from the background with crisp edges and generous padding.
Do not use #00ff00 anywhere in the subject.
No cast shadow, no contact shadow, no reflection, no watermark, and no text unless explicitly requested.
```

Do not automatically use `gpt-image-1.5 --background transparent --output-format png` instead of chroma keying. Ask the user first when the user asks for true/native transparency, when local removal fails validation, or when the requested image is complex: hair, fur, feathers, smoke, glass, liquids, translucent materials, reflective objects, soft shadows, realistic product grounding, or subject colors that conflict with all practical key colors.

Use a concise confirmation like:

```text
This likely needs true native transparency. The default CLI path uses gpt-image-2 with a chroma-key background plus local removal, but true transparency requires gpt-image-1.5 because gpt-image-2 does not support background=transparent. It also requires an image API key. Should I proceed with that model fallback?
```

## Prompt augmentation

Reformat user prompts into a structured, production-oriented spec. Make the user's goal clearer and more actionable, but do not blindly add detail.

Treat this as prompt-shaping guidance, not a closed schema. Use only the lines that help, and add a short extra labeled line when it materially improves clarity.

### Specificity policy

Use the user's prompt specificity to decide how much augmentation is appropriate:

- If the prompt is already specific and detailed, preserve that specificity and only normalize/structure it.
- If the prompt is generic, you may add tasteful augmentation when it will materially improve the result.

Allowed augmentations:
- composition or framing hints
- polish level or intended-use hints
- practical layout guidance
- reasonable scene concreteness that supports the stated request

Not allowed augmentations:
- extra characters or objects that are not implied by the request
- brand names, slogans, palettes, or narrative beats that are not implied
- arbitrary side-specific placement unless the surrounding layout supports it

## Use-case taxonomy (exact slugs)

Classify each request into one of these buckets and keep the slug consistent across prompts and references.

Generate:
- photorealistic-natural — candid/editorial lifestyle scenes with real texture and natural lighting.
- product-mockup — product/packaging shots, catalog imagery, merch concepts.
- ui-mockup — app/web interface mockups and wireframes; specify the desired fidelity.
- infographic-diagram — diagrams/infographics with structured layout and text.
- scientific-educational — classroom explainers, scientific diagrams, and learning visuals with required labels and accuracy constraints.
- ads-marketing — campaign concepts and ad creatives with audience, brand position, scene, and exact tagline/copy.
- productivity-visual — slide, chart, workflow, and data-heavy business visuals.
- logo-brand — logo/mark exploration, vector-friendly.
- illustration-story — comics, children’s book art, narrative scenes.
- stylized-concept — style-driven concept art, 3D/stylized renders.
- historical-scene — period-accurate/world-knowledge scenes.

Edit:
- text-localization — translate/replace in-image text, preserve layout.
- identity-preserve — try-on, person-in-scene; lock face/body/pose.
- precise-object-edit — remove/replace a specific element (including interior swaps).
- lighting-weather — time-of-day/season/atmosphere changes only.
- background-extraction — transparent background / clean cutout. Use CLI `gpt-image-2` with chroma-key removal first for simple opaque subjects; ask before using `gpt-image-1.5` true transparency for complex subjects.
- style-transfer — apply reference style while changing subject/scene.
- compositing — multi-image insert/merge with matched lighting/perspective.
- sketch-to-render — drawing/line art to photoreal render.

## Shared prompt schema

Use the following labeled spec as shared prompt scaffolding for CLI prompts:

```text
Use case: <taxonomy slug>
Asset type: <where the asset will be used>
Primary request: <user's main prompt>
Input images: <Image 1: role; Image 2: role> (optional)
Scene/backdrop: <environment>
Subject: <main subject>
Style/medium: <photo/illustration/3D/etc>
Composition/framing: <wide/close/top-down; placement>
Lighting/mood: <lighting + mood>
Color palette: <palette notes>
Materials/textures: <surface details>
Text (verbatim): "<exact text>"
Constraints: <must keep/must avoid>
Avoid: <negative constraints>
```

Notes:
- `Asset type` and `Input images` are prompt scaffolding, not dedicated CLI flags.
- `Scene/backdrop` refers to the visual setting. It is not the same as the CLI `background` parameter, which controls output transparency behavior.
- Execution notes such as `Quality:`, `Input fidelity:`, masks, output format, and output paths belong in the CLI command, not the image prompt text.

Augmentation rules:
- Keep it short.
- Add only the details needed to improve the prompt materially.
- For edits, explicitly list invariants (`change only X; keep Y unchanged`).
- If any critical detail is missing and blocks success, ask a question; otherwise proceed.

## Examples

### Generation example (hero image)
```text
Use case: product-mockup
Asset type: landing page hero
Primary request: a minimal hero image of a ceramic coffee mug
Style/medium: clean product photography
Composition/framing: wide composition with usable negative space for page copy if needed
Lighting/mood: soft studio lighting
Constraints: no logos, no text, no watermark
```

### Edit example (invariants)
```text
Use case: precise-object-edit
Asset type: product photo background replacement
Primary request: replace only the background with a warm sunset gradient
Constraints: change only the background; keep the product and its edges unchanged; no text; no watermark
```

## Prompting best practices
- Structure prompt as scene/backdrop -> subject -> details -> constraints.
- Include intended use (ad, UI mock, infographic) to set the mode and polish level.
- Use camera/composition language for photorealism.
- Only use SVG/vector stand-ins when the user explicitly asked for vector output or a non-image placeholder.
- Quote exact text and specify typography + placement.
- For tricky words, spell them letter-by-letter and require verbatim rendering.
- For multi-image inputs, reference images by index and describe how they should be used.
- For edits, repeat invariants every iteration to reduce drift.
- Iterate with single-change follow-ups.
- If the prompt is generic, add only the extra detail that will materially help.
- If the prompt is already detailed, normalize it instead of expanding it.
- See `references/cli.md` and `references/image-api.md` for model, `quality`, `input_fidelity`, masks, output format, and output-path guidance.
- For transparent images, use the CLI chroma-key workflow unless the request is complex enough to need true transparency; ask before switching to `gpt-image-1.5`.

More prompting principles: `references/prompting.md`.
Copy/paste prompt specs: `references/sample-prompts.md`.

## Guidance by asset type
Asset-type templates (website assets, game assets, wireframes, logo) are consolidated in `references/sample-prompts.md`.

## gpt-image-2 guidance

The CLI defaults to `gpt-image-2`.

- Use `gpt-image-2` for new CLI/API workflows unless the request needs true model-native transparent output.
- If a transparent request may need true transparency, ask before using `gpt-image-1.5` unless the user already explicitly requested it. Explain that the chroma-key path is the default, but true transparency requires `gpt-image-1.5` because `gpt-image-2` does not support `background=transparent`.
- `gpt-image-2` always uses high fidelity for image inputs; do not set `input_fidelity` with this model.
- `gpt-image-2` supports `quality` values `low`, `medium`, `high`, and `auto`.
- Use `quality low` for fast drafts, thumbnails, and quick iterations. Use `medium`, `high`, or `auto` for final assets, dense text, diagrams, identity-sensitive edits, or high-resolution outputs.
- Square images are typically fastest to generate. Use `1024x1024` for fast square drafts.
- If the user asks for 4K-style output, use `3840x2160` for landscape or `2160x3840` for portrait.
- `gpt-image-2` size may be `auto` or `WIDTHxHEIGHT` if all constraints hold: max edge `<= 3840px`, both edges multiples of `16px`, long-to-short ratio `<= 3:1`, total pixels between `655,360` and `8,294,400`.

Popular `gpt-image-2` sizes:
- `1024x1024` square
- `1536x1024` landscape
- `1024x1536` portrait
- `2048x2048` 2K square
- `2048x1152` 2K landscape
- `3840x2160` 4K landscape
- `2160x3840` 4K portrait
- `auto`

## CLI execution

### Temp and output conventions
These conventions apply to the CLI path.
- Use `tmp/imagegen/` for intermediate files (for example JSONL batches); delete them when done.
- Write final artifacts under `output/imagegen/`.
- Use `--out` or `--out-dir` to control output paths; keep filenames stable and descriptive.

### Dependencies
Prefer `uv` for dependency management in this repo.

Required Python package:
```bash
uv pip install openai
```

Required for local chroma-key removal and optional downscaling:
```bash
uv pip install pillow
```

Portability note:
- If you are using the installed skill outside this repo, install dependencies into that environment with its package manager.
- In uv-managed environments, `uv pip install ...` remains the preferred path.

### Environment
- `IMAGE_GEN_API_KEY` or `OPENAI_API_KEY` must be set for live API calls, unless `--api-key` is passed explicitly.
- `IMAGE_GEN_BASE_URL` or `OPENAI_BASE_URL` may be set for an OpenAI-compatible gateway, unless `--base-url` is passed explicitly.
- Never ask the user to paste the full key in chat. Ask them to set it locally and confirm when ready.

If the key is missing, give the user these steps:
1. Create an API key in the OpenAI platform UI: https://platform.openai.com/api-keys
2. Set `IMAGE_GEN_API_KEY` or `OPENAI_API_KEY` as an environment variable in their system.
3. Offer to guide them through setting the environment variable for their OS/shell if needed.

If installation is not possible in this environment, tell the user which dependency is missing and how to install it into their active environment.

### Script-mode notes
- CLI commands + examples: `references/cli.md`
- API parameter quick reference: `references/image-api.md`
- Network/API environment notes for CLI mode: `references/opencode-network.md`

## Reference map
- `references/prompting.md`: prompting principles.
- `references/sample-prompts.md`: copy/paste prompt recipes.
- `references/cli.md`: CLI usage via `scripts/image_gen.py`.
- `references/image-api.md`: API/CLI parameter reference.
- `references/opencode-network.md`: network/API environment notes for CLI mode.
- `scripts/image_gen.py`: CLI implementation.
- `scripts/remove_chroma_key.py` in this skill directory: local post-processing helper for transparent-image requests.
