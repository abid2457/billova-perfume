# Vercel Deployment Guide — Hira Perfumes Tracker

This guide details how to deploy the **Hira Perfumes Customer & Purchase Tracker** to [Vercel](https://vercel.com).

---

## Prerequisites
- A Vercel Account: [vercel.com/signup](https://vercel.com/signup)
- The GitHub Repository: [github.com/abid2457/billova-perfume.git](https://github.com/abid2457/billova-perfume.git)
- Supabase Project URL & Anon Key:
  - `VITE_SUPABASE_URL` = `https://xpsopjgsxrutssxajezx.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_wx-xsbMR27b8i4qcT6Go5g_uDVo_7aR`
  - `VITE_WHATSAPP_MODE` = `web`

---

## Method 1: Deploy via Vercel Web Dashboard (Recommended)

1. **Log in to Vercel**:
   Go to [vercel.com/dashboard](https://vercel.com/dashboard) and click **"Add New..."** > **"Project"** (or visit [vercel.com/new](https://vercel.com/new)).

2. **Import Git Repository**:
   - Find and select **`abid2457/billova-perfume`**.
   - Click **"Import"**.

3. **Configure Project Settings**:
   - **Framework Preset**: Select **`Other`** (or leave default).
   - **Root Directory**: `./`
   - **Build Command**: `npm run build` *(Auto-configured in `vercel.json`)*
   - **Output Directory**: *(Leave empty — Nitro automatically outputs to `.vercel/output`)*

4. **Add Environment Variables**:
   Under **"Environment Variables"**, add the following 3 keys:

   | Key | Value |
   | :--- | :--- |
   | `VITE_SUPABASE_URL` | `https://xpsopjgsxrutssxajezx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_wx-xsbMR27b8i4qcT6Go5g_uDVo_7aR` |
   | `VITE_WHATSAPP_MODE` | `web` |

5. **Deploy**:
   Click **"Deploy"**. Vercel will build and deploy your application in under a minute with a live production URL!

---

## Method 2: Deploy via Vercel CLI (From Terminal)

1. Run the deploy command:
   ```powershell
   npx vercel
   ```
2. Follow the interactive prompts:
   - **Set up and deploy?**: `Y`
   - **Which scope?**: Select your Vercel account
   - **Link to existing project?**: `N`
   - **What’s your project’s name?**: `hira-perfumes` (or `billova-perfume`)
   - **In which directory is your code located?**: `./`
   - **Want to modify these settings?**: `N`

3. Add environment variables to Vercel:
   ```powershell
   npx vercel env add VITE_SUPABASE_URL production
   npx vercel env add VITE_SUPABASE_ANON_KEY production
   npx vercel env add VITE_WHATSAPP_MODE production
   ```

4. Deploy to Production:
   ```powershell
   npx vercel --prod
   ```

---

## Post-Deployment Checklist

- [ ] Open the deployed Vercel URL in your browser.
- [ ] Log in with your admin credentials created in Supabase Auth.
- [ ] Create a test bill / sale to verify Supabase database connection and realtime sync.
- [ ] Test invoice download and WhatsApp bill sharing.
- [ ] Custom Domain (Optional): Add client's custom domain in Vercel under **Settings > Domains**.
