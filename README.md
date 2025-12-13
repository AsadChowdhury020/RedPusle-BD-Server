```md
# 🩸 RedPulseBD (Server)

This is the backend server for RedPulseBD, built using Express and MongoDB.  
It handles authentication, role-based access, blood donation requests, funding, and secure APIs.

## 🌐 Live Server URL
👉 https://redpulsebd-server.vercel.app  
*(replace with your actual server URL)*

## 🎯 Purpose
- Provide REST APIs for RedPulseBD frontend
- Secure user data using JWT and Firebase Admin
- Manage donation requests and funding records
- Handle Stripe payment verification

## ✨ Key Features
- JWT-protected private routes
- Firebase Admin authentication
- Role-based access control (Admin, Donor, Volunteer)
- CRUD operations for donation requests
- Funding management and total fund calculation
- Stripe checkout and payment verification
- MongoDB aggregation for statistics

## 🛠️ Technologies & NPM Packages
- Node.js
- Express.js
- MongoDB
- Firebase Admin SDK
- JWT
- Stripe
- CORS
- Dotenv

## 📦 Installation
```bash
npm install
npm run dev
