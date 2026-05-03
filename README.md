# Sequence

A GitHub Pages-hosted multiplayer card table for playing Sequence with friends.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Firebase web app with Anonymous Auth and Firestore enabled.

3. Copy `.env.example` to `.env` and fill in the Firebase web config.

4. Start the app:

   ```bash
   npm run dev
   ```

## Deploy

The app deploys to GitHub Pages through `.github/workflows/pages.yml` on pushes to `main`.

For multiplayer on the deployed site, add these repository variables or secrets:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

The expected Pages URL is:

```text
https://krishkc5.github.io/sequence/
```

## Firebase rules

Deploy `firestore.rules` to the Firebase project. This first version uses a casual-trust model suitable for friend games: the UI hides private information, while authenticated users can update room state.
