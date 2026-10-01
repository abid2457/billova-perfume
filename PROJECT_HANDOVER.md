# 🔒 Project State Lock & Master Handover — Hira Perfumes

**Project Name:** Hira Perfumes Customer & Purchase Tracker  
**Live Production URL:** [https://billova-perfume.vercel.app](https://billova-perfume.vercel.app)  
**GitHub Repository:** [https://github.com/abid2457/billova-perfume.git](https://github.com/abid2457/billova-perfume.git)  
**Handover Date:** October 1, 2026  
**Status:** 🚀 **LIVE IN PRODUCTION & LOCKED**

---

## 📌 1. Essential Business & Branding Information

| Parameter | Configuration Value |
| :--- | :--- |
| **Brand Name** | **Hira Perfumes** *(Powered by Billova Perfumes Platform)* |
| **Shop Address** | 215, Anna Salai Main Road, Near Niswan Street (Near Lassi Shop), Melvisharam, Tamil Nadu 632509 |
| **Contact Phone** | `+91 99940 33831` |
| **Logo Asset Path** | [src/assets/hira perfumes.png](file:///a:/barakah%20project/billova%20perfumes/src/assets/hira%20perfumes.png) |
| **Default Currency** | INR (₹) formatted as `en-IN` |

---

## 🗄️ 2. Cloud Backend & Supabase Configuration

| Setting | Value |
| :--- | :--- |
| **Supabase Project URL** | `https://xpsopjgsxrutssxajezx.supabase.co` |
| **Supabase Publishable/Anon Key** | `sb_publishable_wx-xsbMR27b8i4qcT6Go5g_uDVo_7aR` |
| **Storage Bucket** | `invoices` (Public read, authenticated write) |
| **Master Database Setup SQL** | [`supabase_master_setup.sql`](file:///a:/barakah%20project/billova%20perfumes/supabase_master_setup.sql) |

### Key Database Tables
1. **`customers`** — Name, phone, customer code, total purchases, loyalty points, pending balance.
2. **`purchases`** — Invoice number, customer reference, subtotal, discount, grand total, payment method, payment status, invoice PDF/image URL.
3. **`purchase_items`** — Line items linking purchases to products/variants with frozen historical unit prices.
4. **`products`** & **`product_variants`** — Catalog items with volume sizes (e.g., 6ml, 12ml, 50ml, 100ml) and stock levels.
5. **`categories`** — Product classifications (Attar, EDP, Oudh, etc.).
6. **`upi_accounts`** — Store UPI IDs and QR code settings.

---

## ☁️ 3. Vercel Production Deployment

| Detail | Info / Link |
| :--- | :--- |
| **Live Production Domain** | [https://billova-perfume.vercel.app](https://billova-perfume.vercel.app) |
| **Direct Deployment URL** | [https://billova-perfume-fc89v6tjy-abid-barakah-tech.vercel.app](https://billova-perfume-fc89v6tjy-abid-barakah-tech.vercel.app) |
| **Vercel Project Dashboard** | [https://vercel.com/abid-barakah-tech/billova-perfume](https://vercel.com/abid-barakah-tech/billova-perfume) |
| **Vercel Account** | `webarakahtechabid-7040` (`webarakahtechabid@gmail.com`) |
| **Production Environment Variables** | `VITE_SUPABASE_URL`<br>`VITE_SUPABASE_ANON_KEY`<br>`VITE_WHATSAPP_MODE=web` |

---

## 🛠️ 4. Quick Command Reference

```powershell
# 1. Start local development server (Vite + SSR Nitro)
npm run dev

# 2. Run TypeScript type check
npx tsc --noEmit

# 3. Production build test
npm run build

# 4. Deploy directly to Vercel Production
npx vercel --prod --yes

# 5. Check live deployment logs
npx vercel logs billova-perfume.vercel.app
```

---

## 📁 5. Architecture & Key Code References

- **Root Layout & Branding:** [`src/routes/__root.tsx`](file:///a:/barakah%20project/billova%20perfumes/src/routes/__root.tsx)
- **Navigation Sidebar:** [`src/components/app-sidebar.tsx`](file:///a:/barakah%20project/billova%20perfumes/src/components/app-sidebar.tsx)
- **Top Header:** [`src/components/app-header.tsx`](file:///a:/barakah%20project/billova%20perfumes/src/components/app-header.tsx)
- **Data & Supabase API Layer:** [`src/lib/data.ts`](file:///a:/barakah%20project/billova%20perfumes/src/lib/data.ts)
- **Invoice & Thermal Print Generator:** [`src/lib/services/InvoiceService.ts`](file:///a:/barakah%20project/billova%20perfumes/src/lib/services/InvoiceService.ts)
- **WhatsApp Formatter:** [`src/lib/services/MessageBuilder.ts`](file:///a:/barakah%20project/billova%20perfumes/src/lib/services/MessageBuilder.ts)
- **Invoice Route:** [`src/routes/invoice.$invoiceNumber.tsx`](file:///a:/barakah%20project/billova%20perfumes/src/routes/invoice.$invoiceNumber.tsx)

---

## 🔒 6. Codebase Lock Summary
- ✅ **Decoupled:** All previous Aroma references eradicated.
- ✅ **Typesafe:** 0 TypeScript compile errors.
- ✅ **Tested Build:** Clean SSR build passing with zero errors.
- ✅ **Continuous Deployment:** Connected to GitHub `main` branch with automated Vercel CI/CD.
