# 🎬 NitroCine - Movie Ticket Booking System

<div align="center">

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-626CD9?style=for-the-badge&logo=stripe&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white)

**A complete MERN Stack application for booking movie tickets online with real-time seat locking and secure payments.**

[![Live Demo](https://img.shields.io/badge/🚀_Visit_Website-Click_Here-success?style=for-the-badge&logo=vercel&logoColor=white)](https://nitrocine.vercel.app/)

</div>

---

## ✨ Key Features

### For Users 👤

- **Secure Authentication:** Easy login and registration using Clerk.
- **Discover Movies:** Browse featured, trending, and upcoming movies.
- **Watch Trailers:** Integrated video player to watch movie trailers directly.
- **Interactive Seat Selection:** Pick your favorite seats with a real-time availability map.
- **Concurrency Safe:** The system locks your seat while you pay so no one else can take it.
- **Secure Checkout:** Process payments safely using Stripe.
- **User Dashboard:** Track your booking history and favorite movies easily.

### For Admins 🛡️

- **Analytics Dashboard:** View total revenue, ticket sales, and user growth charts.
- **Showtime Management:** Create, update, and schedule new movie shows.
- **Booking Overview:** Monitor and manage all customer tickets in one place.

---

## 📸 Application Screenshots

### 🎭 User Interface

### 🎭 Client Interface

| **Home Page** | **Now Showing** |
|:---:|:---:|
| <img src="./images/client/home_client.png" width="400"/> | <img src="./images/client/feature_client.png" width="400"/> |
| *Hero banner with auto-sliding movies.* | *Grid of popular movies ready to book.* |

| **Trailer Player** | **Upcoming Releases** |
|:---:|:---:|
| <img src="./images/client/trailer_client.png" width="400"/> | <img src="./images/client/release_client.png" width="400"/> |
| *Watch trailers with mute & pause controls.* | *Browse movies coming soon to theaters.* |

| **Search Bar** | **Search Results** |
|:---:|:---:|
| <img src="./images/client/search_client.png" width="400"/> | <img src="./images/client/search_demo_client.png" width="400"/> |
| *Live search powered by TMDB API.* | *Results filtered as you type (debounced).* |

| **Favorites** | **Movie Details** |
|:---:|:---:|
| <img src="./images/client/my_favor.png" width="400"/> | <img src="./images/client/movie_detail.png" width="400"/> |
| *Movies you saved to your watchlist.* | *Rating, runtime, genres and showtimes.* |

| **Seat Selection** | **My Bookings** |
|:---:|:---:|
| <img src="./images/client/seatlayout.png" width="400"/> | <img src="./images/client/my_booking.png" width="400"/> |
| *Interactive seat map with live updates.* | *View tickets and pay with Stripe.* |

| **Account Settings** |
|:---:|
| <img src="./images/client/setting_account_client.png" width="830"/> |
| *Manage your profile via Clerk.* |

---

### 🛠️ Admin Control Panel

| **Dashboard** | **Add New Showtime** |
|:---:|:---:|
| <img src="./images/server/admin_dashboard.png" width="400"/> | <img src="./images/server/add_show.png" width="400"/> |
| Total revenue, bookings, active shows overview. | Pick a movie and schedule screening times. |

| **Manage Shows** |
|:---:|
| <img src="./images/server/list_show_server.png" width="830"/> |
| View all upcoming shows with ticket counts and earnings. |

---

## ⚙️ How It Works (Request Flow)

When a user books a ticket, the system follows this simple and secure flow to make sure seats are booked correctly without errors:

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Frontend as 💻 React Frontend
    participant Backend as ⚙️ Node.js Backend
    participant DB as 🍃 MongoDB
    participant Stripe as 💳 Stripe Payment

    User->>Frontend: Select Seats & Click Book
    Frontend->>Backend: Send Booking Request
    Backend->>DB: Check if seats are available
    DB-->>Backend: Seats Available
    Backend->>DB: Lock Seats (Status: Pending)
    Backend-->>Frontend: Booking Created!
    Frontend->>Backend: Request Payment Link
    Backend->>Stripe: Create Checkout Session
    Stripe-->>Backend: Return Payment URL
    Backend-->>Frontend: Redirect User to Stripe
    User->>Stripe: Complete Payment
    Stripe->>Backend: Webhook (Payment Success)
    Backend->>DB: Update Status to "Paid"
```

---

## 📂 Project Structure

```
cinema-booking/
├── client/                     # Frontend built with React & Vite
│   ├── src/components/         # Reusable UI parts (Navbar, Cards, Loading)
│   ├── src/pages/              # Main pages (Home, SeatLayout, Admin Dashboard)
│   ├── src/context/            # App state and Authentication logic
│   └── src/lib/                # Helpful tools for formatting time and dates
├── server/                     # Backend built with Node.js & Express
│   ├── controllers/            # Logic for Booking, Shows, and Payments
│   ├── models/                 # Database schemas (User, Show, Booking, Movie)
│   ├── inngest/                # Background tasks (e.g., handling timeouts)
│   ├── routes/                 # API endpoint connections
│   └── server.js               # Main entry point for the backend
├── deploy/aws/                 # Scripts to deploy the project to AWS
└── docker-compose.yml          # Docker config to run the app easily
```

---

## 📡 Main API Endpoints

### Booking & Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/booking/create` | Locks the selected seats and creates a pending ticket. |
| `POST` | `/api/booking/pay-now` | Generates a secure Stripe checkout link. |
| `GET`  | `/api/booking/my-bookings` | Gets the ticket history for the logged-in user. |
| `POST` | `/api/stripe/webhook` | Listens to Stripe to know when a user has paid. |

### Shows & Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/show` | Gets the list of available movie showtimes. |
| `POST` | `/api/admin/dashboard` | Gets data for the admin revenue charts. |
| `POST` | `/api/admin/movies` | Adds new movies to the database. |

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite, Tailwind CSS, Axios |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB Atlas, Mongoose |
| **Authentication** | Clerk |
| **Payment Gateway** | Stripe |
| **Background Jobs** | Inngest |
| **Cloud & DevOps** | AWS, Docker |

---

## 🚀 How to Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/hoangduc1003/cinema-booking.git
cd cinema-booking
```

### 2. Setup the Backend

Open a terminal and go to the server folder:

```bash
cd server
npm install
```

Create a `.env` file in the `server` folder and add your secret keys:

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
CLERK_SECRET_KEY=your_clerk_secret_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

Start the backend server:

```bash
npm run server
```

### 3. Setup the Frontend

Open a new terminal and go to the client folder:

```bash
cd client
npm install
```

Create a `.env.local` file in the `client` folder:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:3000/api
```

Start the frontend app:

```bash
npm run dev
```

---

## 👨‍💻 Author

**Nguyễn Đức Hoàng**

- GitHub: [@hoangduc1003](https://github.com/hoangduc1003)
- Focus: Backend Development & High-Performance Computing

If you found this project helpful, please give it a ⭐!