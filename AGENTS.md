# Project Instructions

## Delivery Workflow

- After completing any change in this repository, commit and push the intended changes first.
- After the push succeeds, rerun the WeChat Mini Program `miniprogram-ci` preview flow and share the generated preview QR code with the user.
- Keep preview QR codes and other generated artifacts under `dist/`; do not commit them.
- Keep WeChat upload private keys local and untracked; do not commit key files or hard-code their contents.

## Project Context

- This is a WeChat Mini Program metronome and subdivision practice assistant.
- The mini program root is the repository root, as configured by `project.config.json`.
- The configured AppID is in `project.config.json`; verify it before previewing or uploading.
