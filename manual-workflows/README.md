# Manual GitHub Workflow Installation

Arena's GitHub App can push normal source code but this connection cannot update
`.github/workflows/*`. The two ready-to-use workflow files in this directory are
copies for the repository owner to install through GitHub's web editor.

Install on branch `arena/019f974e-auto-video-backend`:

1. Open `.github/workflows/deploy.yml` on GitHub, click the pencil icon, replace
   all content with `manual-workflows/deploy.yml`, and commit to the same branch.
2. Open `.github/workflows/google_indexing.yml`, replace all content with
   `manual-workflows/google_indexing.yml`, and commit to the same branch.
3. Add the required repository/Firebase secrets described in
   `ai_backend/.env.example` before running deployment.

Do not put secret values directly in either YAML file.
