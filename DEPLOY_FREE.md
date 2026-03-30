# TriCode AI - Free Deployment Guide

## Target
- Hosting: Vercel (Hobby free)
- Database: MongoDB Atlas (M0 free)

## 1) Push code
Push this repository to GitHub.

## 2) Deploy app folder
In Vercel:
- New Project -> Import GitHub repo
- Root Directory: `app`
- Build Command: `npm run build`
- Output: default (Next.js)

## 3) Add env vars
Use values from `.env.production.example`.
Important:
- `NEXT_PUBLIC_URL` must be your Vercel URL (https://...vercel.app)
- `MONGODB_URI` must be Atlas connection string

## 4) MongoDB Atlas
- Create free M0 cluster
- Create DB user
- Network access: allow Vercel egress (for quick start use 0.0.0.0/0)

## 5) Verify
- `/login`
- OTP email send/verify
- `/chat` message send
- `/image` generation path

## 6) VS Code extension
Set extension URL to:
- `https://<your-vercel-domain>/chat`

Then repackage extension:
```bash
cd tricode-ai-vscode
npm install
npm run package
```

Install VSIX:
```bash
code --install-extension tricode-ai-0.1.0.vsix --force
```

## Security
Rotate any key that was ever committed or shared.
