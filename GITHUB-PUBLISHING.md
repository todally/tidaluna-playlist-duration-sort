# Publish Playlist Duration Sort as a TIDALuna plugin store

This project contains a GitHub Actions workflow at `.github/workflows/publish.yml`.
When you push it to `main` or `master`, GitHub Actions builds the plugin and
uploads all files from `dist/` to the **latest** GitHub Release.

## Recommended: GitHub Desktop

1. Extract this ZIP. The `tidaluna-playlist-duration-sort-github-ready` folder is the project root.
2. Open GitHub Desktop. Choose **File > Add local repository**, select the extracted project folder. If GitHub Desktop says it isn't a Git repository, choose **create a repository here**.
3. Commit the files, and use **Publish repository**. Choose the repository name
   `tidaluna-playlist-duration-sort`. Make it public if you want other people to install it.
4. On GitHub, open **Settings > Actions > General** and ensure Actions are permitted.
   Under **Workflow permissions**, select **Read and write permissions** if the option is available.
5. Open the repository's **Actions** tab. The `Build and publish TIDALuna plugin`
   workflow should execute on the default branch. Confirm it succeeds.
6. Open **Releases**. Check that a `latest` release exists with `store.json` and
   plugin files attached.
7. In TIDALuna, add this custom Plugin Store URL (replace placeholders):

   `https://github.com/YOUR-USERNAME/tidaluna-playlist-duration-sort/releases/download/latest/store.json`

   Use the **release asset** URL, not your repository homepage or a raw source URL.

To publish future updates, edit the files, commit and push. The workflow
rebuilds the same rolling `latest` release assets.

## Alternative: GitHub website upload

You can create a new empty repository and upload the project contents, but
make sure the hidden `.github/workflows/publish.yml` file is included. Do not
upload `node_modules` or `dist`. GitHub Desktop is easier for preserving the
nested directories and for updates.

## Notes

- The plugin's folder sorting remains experimental and has not been validated
  inside a live TIDAL client.
- If `pnpm install` fails on an unapproved build script in a future dependency,
  review that package before adding it under `allowBuilds` in `pnpm-workspace.yaml`.
- The release publishing workflow has not yet been executed on GitHub; verify
  the **Actions** run and **Releases** assets after publishing.
- Update `plugins/PlaylistDurationSort/package.json` with your own author
  information before publicly sharing if desired.
