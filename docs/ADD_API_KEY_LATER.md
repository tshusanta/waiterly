# Adding an AI API key later

**Live site:** https://waiterly.vercel.app · **Vercel project:** `waiterly` (team `sushant-52c2`) · **Repo:** https://github.com/tshusanta/waiterly

> **Status (2026-11-26):** `GEMINI_API_KEY` is set in Vercel (production, sensitive), so the live site runs **Gemini `gemini-3.5-flash-lite`**, chosen by `GEMINI_MODEL=gemini-3.5-flash-lite` (set in Vercel 2026-11-26, plain model name, no code change). The free-tier daily limit is per model. `/api/health?models=1` lists the flash models your key can use. It's on Google's **free tier: 20 requests per day per model**. Past that, the app uses its fallback until the quota resets at midnight Pacific. To lift the limit, either enable billing on the Google Cloud project behind the key (start from the key's project in Google AI Studio; Google's rate-limits page explains the paid tiers), or add an `ANTHROPIC_API_KEY` (Claude takes priority).

Waiterly works with or without a key. With no key it runs in **FALLBACK MODE**: a keyword parser, a rule-based trip planner and a summary written from the stats. Adding or changing a key switches the AI **with no code change**. You set one environment variable in Vercel and redeploy.

**Which key is used:**

| Set in Vercel | AI used |
|---|---|
| `ANTHROPIC_API_KEY` | Claude: `claude-haiku-5-5` parses notes and plans trips, `claude-sonnet-5-5` writes the summary. **Use this one for the graded submission**, since the project spec names Claude. |
| only `GEMINI_API_KEY` | Gemini: `gemini-3.8-flash` by default. **Current state:** `GEMINI_MODEL=gemini-3.5-flash-lite`. Optional `GEMINI_THINKING` (off / minimal / low / medium / high) overrides the thinking level. |
| neither | FALLBACK MODE |

If both are set, Claude wins. The selection logic is in `server/provider.ts`.

> **Keep the key secret.** Paste it only into Vercel's form (and your local `.env`, which git ignores). Never put it in chat, code, a screenshot or a commit. If it ever leaks, delete it in the provider's console and create a new one.

---

## Step 1: Get a key

> Website menus change from time to time. If a label below doesn't match exactly, look for the closest equivalent.

### Option A: Claude (recommended)
1. Go to **https://console.anthropic.com** and sign in or create an account.
2. Add a small amount of credit: **Settings → Billing**. API usage is prepaid. A few dollars covers this whole project: one note costs a fraction of a cent on Haiku.
3. Optional but smart: set a monthly spend limit under **Settings → Limits**.
4. Open **Settings → API Keys** and click **Create Key**.
5. Name it `waiterly-vercel` and click **Create**.
6. **Copy the key now.** It starts with `sk-ant-` and is shown only once. Keep it in a password manager until Step 2.

### Option B: Gemini
1. Go to **https://aistudio.google.com** and sign in with a Google account.
2. Click **Get API key**, then **Create API key**.
3. Pick or create a Google Cloud project when asked, then **copy the key**.

---

## Step 2: Add the key in Vercel

1. Go to **https://vercel.com** and log in.
2. On your **Dashboard**, click the **waiterly** project.
3. Click the **Settings** tab at the top of the project page.
4. In the left sidebar, click **Environment Variables**.
5. Fill in the form:
   - **Key:** `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`), typed exactly like that, all capitals.
   - **Value:** paste the key from Step 1, with no spaces or quotes.
   - **Environments:** tick **Production**. Also tick **Preview** if you want preview deployments to use AI.
   - If there's a **Sensitive** toggle, turn it on so the value can't be viewed again in the dashboard.
6. Click **Save**.

The key is now stored, but **the running site doesn't see it yet**. Vercel only applies environment variables to *new* deployments.

---

## Step 3: Redeploy

1. Click the **Deployments** tab at the top of the project page.
2. Find the top deployment marked **Production** (it usually also says **Current**).
3. Click the **⋯** (three dots) menu on the right of that row.
4. Click **Redeploy**.
5. In the dialog, leave the options as they are and click **Redeploy** again.
6. Wait for the status to change to **Ready**. This usually takes under a minute.

**Alternative (terminal):** from the project folder, run `npx vercel --prod`. It also creates a new production deployment that picks up the key.

**Alternative (git):** once the project is connected to GitHub (see the last section), any `git push` to `main` redeploys too.

---

## Step 4: Check that it worked

1. Open **https://waiterly.vercel.app/api/health** in a browser. You should see:
   ```json
   {"ok":true,"aiConfigured":true,"provider":"anthropic", ...}
   ```
   If it still says `"aiConfigured":false`, the redeploy didn't pick up the key. Check the spelling of the variable name, that **Production** was ticked, and redeploy again.
2. Open the site in a **private/incognito window**. The badge at the top right should read **AI ONLINE** instead of **FALLBACK MODE**.
3. On **Service**, tap the **Allergy** scenario chip, then **Organize with AI**. The "Check before adding" card badge should read **AI PARSED**.
4. On **Floor stats**, click **Write shift summary**. The card should read **AI WRITTEN**, and the "AI summary needs an API key" notice should be gone.

---

## Step 5: Record the real-AI test results

From the project folder on your computer:

```bash
node scripts/run-scenarios.mjs https://waiterly.vercel.app --require-ai --delay 7000 --json docs/test-output/ai-live.json
```

It prints PASS/FAIL for every spec scenario against the real model. `--require-ai` counts a fallback answer as FAIL. Against the live site, the script stops after **8 AI requests** to protect the free tier (`--max-ai-calls` changes that). Add `--visits --only "Visit: …"` to run table-visit transcripts. Paste the output into **Section 3** (notes) or **Section 7** (visits) of `docs/TEST_RESULTS.md`, then commit and push. Report any FAIL honestly. That section exists to show what the AI actually did.

To test locally first, put the same line in a file named `.env` in the project folder (`ANTHROPIC_API_KEY=sk-ant-...`), run `npm run dev`, and point the script at `http://localhost:5173`.

---

## Removing or changing the key

- **Change:** Vercel → project → **Settings → Environment Variables** → **⋯** next to the variable → **Edit** → paste the new value → **Save**, then redeploy (Step 3).
- **Remove (back to FALLBACK MODE):** same menu → **Remove**, then redeploy. The app keeps working with no AI.
- **Rotate after a leak:** delete the key in the provider's console *first*, so the old key stops working at once, then add a new one as above.

---

## Connecting GitHub for automatic deploys

The CLI couldn't connect the repo (`vercel git connect` failed). That usually means Vercel's GitHub App doesn't have access to the repo yet. One-time setup:

1. Go to https://vercel.com, open the **waiterly** project, and click **Settings**.
2. In the left sidebar, click **Git**.
3. Under **Connected Git Repository**, click **GitHub** (or **Connect Git Repository**).
4. If GitHub asks you to install or configure **Vercel**: choose your account `tshusanta`, select **Only select repositories**, pick **waiterly**, and click **Install** (or **Save**).
5. Back in Vercel, choose **tshusanta/waiterly** and click **Connect**.
6. Check it worked: the Git page now shows `tshusanta/waiterly` with production branch `main`. From then on, every push to `main` deploys to https://waiterly.vercel.app.

> Share only **https://waiterly.vercel.app**. Deployment-specific URLs such as `waiterly-abc123-….vercel.app` sit behind Vercel's login (Deployment Protection) and won't open for the instructor.
