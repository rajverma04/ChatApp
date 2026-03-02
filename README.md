# Real-Time Chat Application

A modern, real-time chat application built with Socket.io, React, MongoDB, and Tailwind CSS. Features include private messaging, typing indicators, message status tracking, offline support, and password authentication.

## Features

- 🔐 **Password Authentication** - Secure login/signup with bcrypt password hashing
- 💬 **Real-Time Messaging** - Instant private messages between users
- ✅ **Message Status** - WhatsApp-style single/double/blue ticks (sent/delivered/read)
- ⌨️ **Typing Indicators** - See when other users are typing
- 🌐 **Offline Support** - Track online/offline status with last seen timestamps
- 📦 **Message Queue** - Messages are delivered when offline users come online
- 💾 **MongoDB Persistence** - All messages and users stored in database
- 🎨 **Modern UI** - Beautiful sky blue theme with Tailwind CSS and shadcn/ui components
- 📱 **Responsive Design** - Works seamlessly on all device sizes

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express** - Web server framework
- **Socket.io** - Real-time bidirectional communication
- **MongoDB** - NoSQL database for data persistence
- **Mongoose** - MongoDB object modeling
- **bcryptjs** - Password hashing and authentication
- **dotenv** - Environment variable management

### Frontend
- **React 19** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - Reusable UI components
- **Socket.io Client** - Real-time client connection
- **Lucide React** - Icon library

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v16 or higher)
- **npm** or **yarn** package manager
- **MongoDB** (running locally or a connection URI)

## Installation & Setup

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd sockets
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env file and configure your environment variables
# PORT=4000
# MONGODB_URI=mongodb://localhost:27017/chat-app
```

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env file if needed (optional for local development)
# VITE_BACKEND_URL=http://localhost:4000
```

### 4. Start MongoDB

Make sure MongoDB is running on your machine:

```bash
# macOS (with Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 5. Run the Application

Open two terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Backend will start on http://localhost:4000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Frontend will start on http://localhost:5173
```

### 6. Access the Application

Open your browser and navigate to:
```
http://localhost:5173
```

## Usage

1. **First Time Users:**
   - Enter a username and password (minimum 3 characters)
   - Click "Login / Sign Up" to create an account

2. **Returning Users:**
   - Enter your existing username and password
   - Click "Login / Sign Up" to sign in

3. **Chat Features:**
   - Select a user from the sidebar to start chatting
   - See typing indicators when someone is typing
   - Message status: ✓ (sent), ✓✓ (delivered), ✓✓ (blue - read)
   - View last seen for offline users
   - Messages are queued for offline users

4. **Disconnect:**
   - Click your username in the header to logout

## Project Structure

```
sockets/
├── backend/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── models/
│   │   ├── User.js              # User schema with authentication
│   │   └── Message.js           # Message schema with status
│   ├── server.js                # Socket.io server & API
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main React component
│   │   ├── utils/
│   │   │   └── socket.js        # Socket.io client connection
│   │   └── ...
│   ├── package.json
│   └── .env.example
│
└── README.md
```

## Environment Variables

### Backend (.env)
```
PORT=4000
MONGODB_URI=mongodb://localhost:27017/chat-app
```

### Frontend (.env)
```
VITE_BACKEND_URL=http://localhost:4000
```

## API Endpoints

### HTTP Endpoints
- `GET /health` - Health check endpoint (returns server and MongoDB status)

### Socket.io Events

#### Client → Server
- `join` - Join with username and password `{userName, password}`
- `send_message` - Send a message `{userName, to, message}`
- `typing` - Notify typing `{from, to}`
- `stop_typing` - Stop typing `{from, to}`
- `messages_read` - Mark messages as read `{from, to}`
- `leave` - Leave the chat
- `disconnect` - Handle disconnection

#### Server → Client
- `join_success` - Successful login `{userName}`
- `join_error` - Login failed `{error}`
- `receive_message` - New message received
- `users` - Updated user list
- `message_history` - Previous messages for conversation
- `message_delivered` - Message delivery confirmation
- `messages_read` - Messages read confirmation
- `typing` - User is typing `{from, to}`
- `stop_typing` - User stopped typing `{from, to}`

## Database Schema

### User Model
```javascript
{
  name: String (unique, minlength: 3),
  password: String (required, minlength: 3, hashed),
  socketId: String,
  online: Boolean,
  lastSeen: Date,
  createdAt: Date
}
```

### Message Model
```javascript
{
  from: String,
  to: String,
  message: String,
  status: String (enum: 'sent', 'delivered', 'read'),
  createdAt: Date
}
```

## Scripts

### Backend
```bash
npm run dev    # Start with auto-reload (--watch)
npm start      # Start production server
```

### Frontend
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongosh` or check service status
- Verify connection string in backend `.env` file
- Check firewall settings if using remote MongoDB

### Port Already in Use
- Backend: Change `PORT` in backend `.env`
- Frontend: Change port in `vite.config.js` or use `--port` flag

### Socket Connection Failed
- Verify backend is running on the correct port
- Check `VITE_BACKEND_URL` in frontend `.env`
- Check CORS settings in backend `server.js`

### Password Authentication Not Working
- Ensure bcryptjs is installed in backend
- Check MongoDB for existing users without passwords (migration handles this)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Acknowledgments

- Socket.io for real-time communication
- shadcn/ui for beautiful UI components
- Tailwind CSS for styling utilities
- MongoDB for database management

## Deployment

### Backend Deployment

⚠️ **Important:** Vercel doesn't support persistent WebSocket connections required by Socket.io. Use one of these platforms instead:

#### Render (Recommended - Free Tier Available)

1. Create account at [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Render will auto-detect the `render.yaml` configuration
5. Add environment variable: `MONGODB_URI`
6. Click "Create Web Service"
7. Copy the deployed URL (e.g., `https://your-app.onrender.com`)

#### Railway

1. Create account at [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository and the `backend` folder
4. Add environment variables: `PORT`, `MONGODB_URI`
5. Deploy and copy the URL

#### Alternative: DigitalOcean, Heroku, AWS, Azure, GCP

All support Node.js and WebSocket connections.

### Frontend Deployment (Vercel/Netlify)

Frontend can be deployed to Vercel or Netlify:

**Vercel:**
```bash
cd frontend
npm run build
vercel --prod
```

**Netlify:**
```bash
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

### Environment Variables for Production

**Backend:**
- `PORT` - Server port (usually provided by hosting platform)
- `MONGODB_URI` - MongoDB connection string (use MongoDB Atlas for cloud)

**Frontend:**
- `VITE_BACKEND_URL` - Your deployed backend URL (e.g., `https://your-app.onrender.com`)

### MongoDB Atlas Setup (for Production)

1. Create account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create database user with password
4. Whitelist all IPs: `0.0.0.0/0` (Network Access)
5. Get connection string and add to backend env vars

## Troubleshooting Deployment

### WebSocket Connection Failed on Vercel
- **Issue:** Vercel doesn't support persistent WebSocket connections
- **Solution:** Deploy backend to Render, Railway, or another WebSocket-compatible platform

### CORS Errors
- Ensure backend CORS is configured to accept your frontend domain
- Update `origin: "*"` to `origin: "https://your-frontend.vercel.app"` for better security

### MongoDB Connection Timeout
- Use MongoDB Atlas for cloud deployments
- Ensure IP whitelist includes `0.0.0.0/0` or your server's IP
- Check connection string format and credentials

### Environment Variables Not Working
- Ensure `.env` files are added to Vercel/Render environment variables
- Restart/redeploy after adding environment variables
- Use correct prefix: `VITE_` for frontend variables

## Support

For issues, questions, or contributions, please open an issue in the repository.

---

**Happy Chatting! 💬**


media sharing:  Allow users to upload profile pictures, set a bio, and update their "status" (e.g., Busy, Working).
emoji reactions: Allow users to react to messages with emojis (e.g., like, love, haha, wow, sad, angry).