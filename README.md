# GitHub Actions Artifacts UI

A lightweight frontend tool to view non-expired GitHub Actions artifacts across your repositories. It groups artifacts by repository, sorts them by size (largest first), and enables you to generate deep links to workflow run attempts. Optionally, you can store your GitHub token (client-side encrypted) for convenience.

## Demo

View the deployed application at: [https://waog.github.io/github-storage-quota/](https://waog.github.io/github-storage-quota/)

## Getting Started

### Prerequisites

- **Node.js** (version 14 or later)
- A GitHub Personal Access Token with the `repo` scope. Create one [here](https://github.com/settings/tokens/new).

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/github-actions-artifacts-ui.git
cd github-actions-artifacts-ui
npm install
```

### Running Locally

Start the development server with:

```bash
npm start
```

Your default browser will open the application automatically.

### Building for Production

Run the following command to build the project:

```bash
npm run build
```

The output will be in the `dist` folder.

## Deployment

This project is automatically deployed to GitHub Pages using GitHub Actions. For details, see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Security Notice

The application stores your GitHub token in localStorage using client-side encryption with a hard-coded key for convenience. **Do not use this on public or shared devices** or with tokens having elevated scopes.

## License

This project is licensed under the MIT License.
