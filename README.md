# Task_data_team

Daymark is a secure, single-user task manager hosted on Netlify. The static frontend never receives credentials or signing secrets. Netlify Functions handle login, authenticated CRUD, and a persistent CSV stored in Netlify Blobs.

## Architecture

- `netlify/`: public HTML, CSS, and vanilla JavaScript
- `netlify-functions/`: private server-side login, session, and task endpoints
- Netlify environment variables: username, scrypt password hash, and session-signing secret
- Netlify Blobs: private site-wide store named `daymark-data`, containing `tasks.csv`
- `netlify/config.js`: public task-owner labels only; it contains no credentials

Only the `netlify` directory is published. Function source, scripts, and project documentation are not exposed as website files.

## 1. Configure task owners

Edit the one public owner list in `netlify/config.js`:

```js
TASK_OWNERS: Object.freeze(["Me", "Alex", "Sam"]),
```

Owners are labels for tasks, not additional login accounts. This remains a single-user application.

## 2. Generate the password hash

Use a strong password of at least 12 characters. The helper outputs a salted scrypt hash; it never writes the password to a file.

```bash
read -s -p "Password: " DAYMARK_PASSWORD && echo
export DAYMARK_PASSWORD
npm run hash-password
unset DAYMARK_PASSWORD
```

Copy the single output line beginning with `scrypt$`. Do not use the original password as an environment-variable value.

Generate a separate session secret:

```bash
openssl rand -base64 48
```

## 3. Create the Netlify project and private variables

1. Import the GitHub repository into Netlify.
2. Netlify reads `netlify.toml`; no build command is required and the publish directory is already set to `netlify`.
3. Open **Project configuration → Environment variables**.
4. Add these variables and ensure their scope includes **Functions**:
   - `AUTH_USERNAME`: the private login username.
   - `AUTH_PASSWORD_HASH`: the complete `scrypt$...` output from step 2.
   - `SESSION_SECRET`: the independent random value from `openssl` (at least 32 characters).
5. Trigger a fresh production deploy after setting or changing variables.

Do not place these values in `config.js`, `netlify.toml`, GitHub, or any frontend file. Netlify does not expose Functions-scoped runtime variables to browser JavaScript.

## 4. Sign in and create the CSV

Open the deployed site and sign in with `AUTH_USERNAME` and the original password. Adding the first task creates the private `tasks.csv` blob automatically.

The CSV columns are:

```text
ID,Title,Description,Owner,Priority,Status,CreatedAt
```

To inspect or download it, open **Netlify → Data & Storage → Blobs → daymark-data → tasks.csv**. Do not publish this blob or expose arbitrary blob keys through a function.

## Local development

Install dependencies and link the directory to the Netlify project:

```bash
npm install
npx netlify link
npx netlify dev
```

Netlify Dev emulates Functions and Blobs. Its local Blob data is separate from production. Keep any local `.env` file private; `.gitignore` excludes it.

## Security design

- Passwords are checked server-side against a salted 64-byte scrypt hash using constant-time comparison.
- Successful login creates an HMAC-SHA-256 signed, eight-hour `HttpOnly`, `SameSite=Strict`, `Secure` production cookie.
- Login attempts are rate-limited by a one-way hash of the client IP.
- Mutating requests require a matching same-origin `Origin` header, adding CSRF protection alongside SameSite cookies.
- Every task endpoint verifies the signed session before reading the CSV.
- Task writes use strong reads and ETag conditional updates to prevent silent concurrent overwrites.
- Inputs have server-side length and enum validation. CSV quoting supports commas, quotes, and newlines, and formula-like cells are neutralized.
- Security headers prohibit framing, external scripts, objects, and cross-origin API connections.
- The browser never reads `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, or `SESSION_SECRET` from Netlify's environment.

Rotate `SESSION_SECRET` to invalidate every active session immediately. Change both `AUTH_PASSWORD_HASH` and `SESSION_SECRET` if a password may have been exposed.

## Verification

```bash
npm run check
```

Dependency installation requires npm network access. Netlify installs the pinned `@netlify/blobs` dependency during deployment.

## Troubleshooting

- **Server configuration error**: confirm all three variables exist and include the Functions scope, then redeploy.
- **Invalid username or password**: usernames are case-sensitive; regenerate the hash if necessary.
- **Functions return 404**: confirm Netlify used the repository root and detected `netlify.toml`.
- **Task changes conflict**: reload and retry; another request updated the CSV between the strong read and conditional write.
- **No CSV appears yet**: the Blob is created on the first successful task creation, not at deploy time.
