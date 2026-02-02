# Collective Advantage
### Fractional Investment & Social Savings Platform — Uganda

A Next.js web application where users pool funds to finance development projects (rentals, schools, businesses), earn monthly dividends, and grow wealth collectively.

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Next.js 15 (App Router) + Tailwind CSS + Firebase Client   │
│                                                             │
│  /            → Landing + Auth (Phone/Email)                │
│  /pay-activation → Activation Payment Gate                  │
│  /dashboard   → Investor Dashboard (mobile-first)          │
│  /invest      → Project Marketplace                         │
│  /admin       → Admin Panel (project CRUD + verification)   │
└────────────────────┬────────────────────────────────────────┘
                     │  API Routes (Next.js)
┌────────────────────▼────────────────────────────────────────┐
│                     BACKEND (Edge/Serverless)                 │
│                                                             │
│  POST /api/auth/register     → Create user doc in Firestore │
│  GET  /api/projects          → List all projects            │
│  POST /api/projects          → Create project (admin only)  │
│  POST /api/payments/webhook  → Flutterwave webhook handler  │
│       ├─ reg_fee     → Activate user + pay referral bonus   │
│       └─ investment  → Credit slot + update project status  │
└────────────────────┬────────────────────────────────────────┘
                     │  Firebase Admin SDK
┌────────────────────▼────────────────────────────────────────┐
│                     FIREBASE                                  │
│  Auth        → Phone + Email authentication                 │
│  Firestore   → users, projects, transactions collections    │
│  Security Rules → Per-user data isolation                   │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              PAYMENT GATEWAY (Flutterwave)                    │
│  Inline Checkout → MTN MoMo, Airtel Money, Card             │
│  Webhook         → POST confirmation to your server         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
collective-advantage/
├── firestore.rules              ← Firebase Security Rules (Deliverable #1)
├── .env.example                 ← Environment variable template
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── package.json
└── src/
    ├── app/
    │   ├── layout.tsx           ← Root layout (fonts, AuthProvider)
    │   ├── globals.css          ← Dark theme design system
    │   ├── page.tsx             ← Landing & Auth page
    │   ├── pay-activation/
    │   │   └── page.tsx         ← Activation payment gate
    │   ├── dashboard/
    │   │   └── page.tsx         ← Investor Dashboard (Deliverable #3)
    │   ├── invest/
    │   │   └── page.tsx         ← Project Marketplace
    │   ├── admin/
    │   │   └── page.tsx         ← Admin Panel
    │   └── api/
    │       ├── auth/register/route.ts
    │       ├── projects/route.ts
    │       └── payments/webhook/route.ts  ← Referral logic (Deliverable #2)
    ├── components/
    │   └── ProtectedLayout.tsx  ← Auth guard + nav shell
    └── lib/
        ├── AuthContext.tsx      ← Global auth state provider
        ├── firebase.client.ts   ← Client-side Firebase init
        ├── firebase.admin.ts    ← Server-side Admin SDK init
        └── payments.ts          ← Flutterwave integration
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js 18+ and npm
- A Firebase project (with Auth + Firestore enabled)
- A Flutterwave account (for payment integration)
- A Vercel account (for deployment)

### 2. Installation

```bash
# Clone or extract this project
cd collective-advantage

# Install dependencies
npm install

# Create your .env.local from the template
cp .env.example .env.local
# Edit .env.local with your actual Firebase & Flutterwave keys
```

### 3. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Create a new project.
2. Enable **Authentication** → Turn on **Phone** and **Email/Password** sign-in methods.
3. Enable **Firestore Database** → Start in production mode.
4. Go to **Project Settings** → Copy the web app config keys into your `.env.local`.
5. Download the **Service Account** private key JSON and extract the values into `.env.local`.

### 4. Deploy Firestore Security Rules

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login
firebase login

# Initialize (select your project, choose Firestore)
firebase init firestore

# Deploy rules
firebase deploy --only firestore:rules
```

### 5. Set Admin Custom Claim

To grant admin access to a user, run this once in a Node.js script:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./path-to-service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Replace with the actual UID of your admin user
const adminUid = 'YOUR_ADMIN_USER_UID';

admin.auth().setCustomUserClaims(adminUid, { admin: true })
  .then(() => console.log('Admin claim set successfully.'))
  .catch(console.error);
```

### 6. Configure Flutterwave Webhook

1. Log in to your [Flutterwave Dashboard](https://dashboard.flutterwave.com).
2. Go to **Settings → Webhooks**.
3. Add this URL as your webhook endpoint:
   ```
   https://your-vercel-domain.com/api/payments/webhook
   ```
4. Copy the webhook HMAC secret into your `.env.local` as `FLUTTERWAVE_WEBHOOK_SECRET`.

### 7. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Add environment variables in the Vercel dashboard
# (paste all values from your .env.local)
```

Or connect your GitHub repo directly in the Vercel dashboard for automatic deploys on push.

### 8. Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## 🔑 Key Design Decisions

### The Activation Lock
New users cannot access any feature until they pay the 20,000 UGX registration fee. This is enforced at two levels: the `ProtectedLayout` component checks `is_active` before rendering any page, and the Firestore security rules prevent inactive users from reading project or transaction data.

### Webhook as Source of Truth
The Flutterwave payment modal closing does NOT confirm payment. The webhook is the authoritative confirmation. This prevents race conditions, failed payments being treated as successful, and duplicate payouts. The webhook handler includes idempotency checks (via `tx_ref`) to safely handle retries.

### Atomic Slot Updates
When multiple users buy slots simultaneously, a Firestore transaction ensures the `filled_slots` count is updated atomically. This prevents overselling a project.

### Mobile-First Dashboard
The dashboard uses a responsive grid (2×2 on mobile, 4-across on desktop) for summary cards, and a single-column stacked layout for investment cards and transaction history. A bottom navigation bar appears on mobile for easy thumb access.

---

## ⚠️ Legal Note

Pooling money for profit sharing may be classified as a **Collective Investment Scheme** by Uganda's Capital Markets Authority (CMA). Before launching publicly, it is strongly recommended to:
1. Register as a **Company Limited by Shares** in Uganda.
2. Consult with a legal advisor regarding CMA compliance.
3. Ensure all investor communications include appropriate disclaimers.

---

## 🛣️ Roadmap (Post-MVP)

- [ ] Short referral codes (instead of raw UIDs)
- [ ] Dividend distribution automation (cron job or Cloud Function)
- [ ] Project image uploads (Firebase Storage)
- [ ] SMS notifications via Twilio/AfricasTalking
- [ ] Investor withdrawal flow
- [ ] Real-time project funding updates (WebSocket or Firestore listeners)
- [ ] CMA compliance documentation page
