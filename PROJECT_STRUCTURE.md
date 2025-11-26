# SnapifY - Event Sharing Platform

## 📋 Overview

SnapifY is a comprehensive event sharing platform that allows users to create shared photo/video albums for events like birthdays, weddings, and parties. The platform features real-time collaboration, AI-powered features, and a tiered subscription system.

## 🛠 Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Socket.io Client** for real-time features

### Backend
- **Node.js** with Express
- **SQLite** database with better-sqlite3
- **Socket.io** for real-time communication
- **JWT** for authentication
- **bcrypt** for password hashing
- **Nodemailer** for email notifications

### External Services
- **Google OAuth2** for authentication
- **Google Gemini AI** for image captioning and event descriptions
- **MinIO/S3** for file storage
- **Sharp** for image processing
- **FFmpeg** for video processing

### DevOps & Deployment
- **PM2** for process management
- **Nginx** for reverse proxy
- **Docker** ready configuration
- **PWA** capabilities

## 📁 Project Structure

```
/var/www/snapify/
├── 📄 .env                           # Environment variables
├── 📄 .gitignore                     # Git ignore rules
├── 📄 AI_DEVELOPER_GUIDE.md          # AI development guidelines
├── 📄 DEPLOYMENT.md                  # Deployment instructions
├── 📄 README.md                      # Project overview
├── 📄 PROJECT_STRUCTURE.md           # This file
├── 📄 package.json                   # Frontend dependencies
├── 📄 package-lock.json              # Dependency lock file
├── 📄 tsconfig.json                  # TypeScript configuration
├── 📄 vite.config.ts                 # Vite build configuration
├── 📄 index.html                     # Main HTML template
├── 📄 index.tsx                      # React application entry point
├── 📄 App.tsx                        # Main application component
├── 📄 constants.ts                   # Application constants and translations
├── 📄 types.ts                       # TypeScript type definitions
├── 📄 metadata.json                  # PWA metadata
├── 📄 nginx.conf                     # Nginx configuration
├── 📄 ecosystem.config.cjs           # PM2 configuration
├── 📄 restart.sh                     # Deployment restart script
├── 📄 stop.sh                        # Stop application script
├── 📄 deploy.sh                      # Deployment script
├── 📄 instant-deploy.sh              # Instant deployment script
├── 📁 dist/                          # Build output directory
├── 📁 logs/                          # Application logs
├── 📁 node_modules/                  # Node.js dependencies
├── � components/                    # React components
│   ├── 📄 AdminDashboard.tsx         # Admin management interface
│   ├── 📄 CameraCapture.tsx          # Camera functionality
│   ├── 📄 ContactModal.tsx           # Upgrade/contact modal
│   ├── 📄 CreateEventModal.tsx       # Event creation form
│   ├── 📄 EventGallery.tsx           # Event photo gallery
│   ├── 📄 GuestLoginModal.tsx        # Guest access modal
│   ├── 📄 LandingPage.tsx            # Landing/marketing page
│   ├── 📄 LiveSlideshow.tsx          # Real-time slideshow
│   ├── 📄 MediaReviewModal.tsx       # Media upload review
│   ├── 📄 Navigation.tsx             # Top navigation bar
│   ├── 📄 OfflineBanner.tsx          # Offline notification
│   ├── 📄 PricingCard.tsx            # Pricing tier display
│   ├── 📄 PWAInstallPrompt.tsx       # PWA installation prompt
│   ├── 📄 ReloadPrompt.tsx           # App reload prompt
│   ├── 📄 ShareModal.tsx             # Event sharing modal
│   ├── 📄 ShareTargetHandler.tsx     # PWA share target
│   ├── 📄 StudioSettingsModal.tsx    # Studio branding settings
│   ├── 📄 TermsModal.tsx             # Terms and privacy modal
│   ├── 📄 UserDashboard.tsx          # User event management
│   └── 📄 VendorAdCard.tsx           # Vendor advertisement card
├── 📁 hooks/                         # Custom React hooks
│   └── 📄 usePWA.ts                  # PWA functionality hook
├── 📁 services/                      # API and external services
│   ├── 📄 api.ts                     # REST API client
│   ├── 📄 geminiService.ts           # Google Gemini AI service
│   ├── 📄 geolocationService.ts      # Geolocation service
│   ├── 📄 ollamaService.ts           # Local AI service (backup)
│   └── 📄 socketService.ts           # Socket.io client service
├── 📁 utils/                         # Utility functions
│   ├── 📄 deviceDetection.ts         # Device/browser detection
│   ├── 📄 deviceFingerprint.ts       # Device fingerprinting
│   └── 📄 imageProcessing.ts         # Image watermarking
├── 📁 server/                        # Backend server
│   └── 📄 index.js                   # Express server application
└── 📁 production-deploy/             # Production deployment files
    ├── 📄 deploy-production.sh       # Production deployment script
    ├── 📄 ecosystem.config.cjs       # Production PM2 config
    ├── 📄 nginx.conf                 # Production nginx config
    ├── 📄 package.json               # Production dependencies
    ├── 📄 package-lock.json          # Production lockfile
    ├── 📄 README.md                  # Production deployment guide
    └── 📁 server/                    # Production server files
        ├── 📄 index.js               # Production server
        └── 📁 uploads/               # Upload directory
```

## 🎯 Key Features

### Core Functionality
- **Event Creation**: Users can create events with themes, dates, and AI-generated descriptions
- **Photo/Video Upload**: Support for images and videos with real-time gallery updates
- **Guest Access**: PIN-protected or public event access for guests
- **Real-time Collaboration**: Live photo sharing during events
- **AI Features**: Automatic image captions and event descriptions

### User Management
- **Multi-tier Subscription**: FREE, BASIC, PRO, STUDIO plans
- **Google OAuth**: Seamless authentication
- **Email/Password**: Traditional authentication
- **Role-based Access**: USER, PHOTOGRAPHER, ADMIN roles

### Advanced Features
- **Watermarking**: Custom studio branding for PRO/STUDIO users
- **Analytics**: Event view/download statistics
- **Bulk Operations**: Mass media deletion
- **PWA Support**: Installable web app with offline capabilities
- **Real-time Notifications**: Socket.io powered notifications

## 🗄 Database Schema

### Users Table
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'USER',           -- USER, PHOTOGRAPHER, ADMIN
    tier TEXT DEFAULT 'FREE',           -- FREE, BASIC, PRO, STUDIO
    storageUsedMb REAL DEFAULT 0,
    storageLimitMb REAL,                -- -1 for unlimited
    joinedDate TEXT,
    studioName TEXT,                    -- For photographers
    logoUrl TEXT,                       -- Studio logo
    watermarkOpacity REAL,
    watermarkSize REAL,
    watermarkPosition TEXT,
    watermarkOffsetX REAL,
    watermarkOffsetY REAL
);
```

### Events Table
```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    date TEXT,
    city TEXT,
    hostId TEXT,                        -- References users.id
    code TEXT,                          -- Unique event code
    coverImage TEXT,
    coverMediaType TEXT,
    expiresAt TEXT,                     -- Event expiration
    pin TEXT,                           -- Optional PIN protection
    views INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    FOREIGN KEY(hostId) REFERENCES users(id) ON DELETE CASCADE
);
```

### Media Table
```sql
CREATE TABLE media (
    id TEXT PRIMARY KEY,
    eventId TEXT,                       -- References events.id
    type TEXT,                          -- 'image' or 'video'
    url TEXT,                           -- S3 key
    previewUrl TEXT,                    -- Thumbnail for videos
    isProcessing INTEGER DEFAULT 0,     -- Video processing status
    caption TEXT,
    uploadedAt TEXT,
    uploaderName TEXT,
    uploaderId TEXT,                    -- Guest or user ID
    isWatermarked INTEGER,              -- Watermark status
    watermarkText TEXT,
    likes INTEGER DEFAULT 0,
    privacy TEXT DEFAULT 'public',      -- 'public' or 'private'
    FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
);
```

### Additional Tables
- **guestbook**: Event messages from guests
- **comments**: Media comments
- **vendors**: Photographer/vendor advertisements

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/google` - Google OAuth login

### User Management
- `GET /api/users` - Get all users (admin only)
- `PUT /api/users/:id` - Update user profile
- `PUT /api/users/:id/upgrade` - Upgrade user tier (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)

### Events
- `GET /api/events` - Get user's events
- `GET /api/events/:id` - Get specific event
- `POST /api/events` - Create new event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event
- `POST /api/events/:id/view` - Increment view count

### Media
- `POST /api/media` - Upload media file
- `DELETE /api/media/:id` - Delete media
- `POST /api/media/bulk-delete` - Bulk delete media
- `PUT /api/media/:id/like` - Like/unlike media

### AI Features
- `POST /api/ai/generate-caption` - Generate image caption
- `POST /api/ai/generate-event-description` - Generate event description

### Upgrade System
- `POST /api/upgrade-request` - Submit upgrade request

### System
- `GET /api/health` - Health check
- `GET /api/system/storage` - Storage usage (admin only)
- `POST /api/admin/reset` - System reset (admin only, dev only)

## 🧩 Component Architecture

### Page Components
- **App.tsx**: Main application router and state management
- **LandingPage.tsx**: Marketing page with pricing
- **UserDashboard.tsx**: User's event management
- **EventGallery.tsx**: Photo gallery for events
- **AdminDashboard.tsx**: Administrative interface

### Modal Components
- **ContactModal.tsx**: Upgrade request interface
- **CreateEventModal.tsx**: Event creation form
- **GuestLoginModal.tsx**: Guest access authentication
- **MediaReviewModal.tsx**: Upload confirmation
- **StudioSettingsModal.tsx**: Branding configuration

### Utility Components
- **Navigation.tsx**: Top navigation bar
- **PricingCard.tsx**: Subscription tier display
- **OfflineBanner.tsx**: Network status indicator
- **PWAInstallPrompt.tsx**: App installation prompt

## 🔐 Authentication & Authorization

### User Roles
- **USER**: Standard user with FREE tier limitations
- **PHOTOGRAPHER**: Enhanced user with STUDIO features
- **ADMIN**: Full system access and user management

### Tier System
- **FREE**: 7 hours access, 100MB storage, basic features
- **BASIC**: 30 days access, 10GB storage, HD uploads, AI captions
- **PRO**: 30 days access, 30GB storage, 4K video, custom branding
- **STUDIO**: Unlimited events, watermarking, client analytics

### Security Features
- JWT token authentication
- Password hashing with bcrypt
- Rate limiting for sensitive operations
- Input sanitization and validation
- Admin-only endpoints protection

## 📡 Real-time Features

### Socket.io Events
- **Connection Management**: User authentication and room joining
- **Media Uploads**: Real-time gallery updates
- **Live Slideshow**: Synchronized presentation
- **Admin Notifications**: Upgrade request alerts
- **User Updates**: Profile and tier changes

### Notification System
- **Upgrade Requests**: Email + real-time notifications
- **User Updates**: Automatic UI refresh
- **Media Processing**: Upload status updates
- **System Alerts**: Admin maintenance notifications

## 🚀 Deployment & Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3001
NODE_ENV=production
JWT_SECRET=your_jwt_secret
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=secure_password

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Google Services
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# AI Services
GEMINI_API_KEY=your_gemini_api_key

# Storage Configuration
S3_ENDPOINT=http://localhost:9000
S3_BUCKET_NAME=snapify-media
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
```

### Production Setup
1. **Database**: SQLite with automatic schema migration
2. **File Storage**: MinIO/S3 compatible storage
3. **Reverse Proxy**: Nginx with SSL termination
4. **Process Management**: PM2 with clustering
5. **Monitoring**: Built-in health checks and logging

## 📱 Progressive Web App (PWA)

### Features
- **Installable**: Add to home screen
- **Offline Support**: Service worker caching
- **Push Notifications**: Event updates (planned)
- **Share Target**: Direct photo sharing to events
- **Background Sync**: Upload retry when online

### PWA Files
- **sw.js**: Service worker for caching
- **manifest.webmanifest**: App metadata
- **Icons**: Multiple sizes for different devices

## 🔧 Development Guidelines

### Code Style
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code quality enforcement
- **Prettier**: Consistent code formatting
- **Component Structure**: Functional components with hooks

### State Management
- **React State**: Local component state
- **Context API**: Global application state (planned)
- **Server State**: API calls with error handling
- **Real-time**: Socket.io for live updates

### Error Handling
- **API Errors**: User-friendly error messages
- **Network Issues**: Offline detection and retry logic
- **Validation**: Client and server-side input validation
- **Fallbacks**: Graceful degradation for missing features

### Performance Optimization
- **Image Optimization**: Sharp for resizing and compression
- **Lazy Loading**: Component and image lazy loading
- **Caching**: Service worker and browser caching
- **Bundle Splitting**: Code splitting for better load times

## 🎨 UI/UX Design

### Design System
- **Color Palette**: Indigo/purple primary, amber accent
- **Typography**: Clean, modern font stack
- **Spacing**: Consistent 4px grid system
- **Components**: Reusable, accessible UI components

### Responsive Design
- **Mobile First**: Optimized for mobile devices
- **Tablet Support**: Adaptive layouts for tablets
- **Desktop Enhancement**: Additional features for larger screens
- **Touch Friendly**: Appropriate touch targets

### Accessibility
- **WCAG Compliance**: Aiming for WCAG 2.1 AA
- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: Proper ARIA labels
- **Color Contrast**: High contrast ratios

## 📈 Future Development Roadmap

### Planned Features
- [ ] Advanced analytics dashboard
- [ ] Social media integration
- [ ] Bulk event management
- [ ] Advanced AI features (face recognition, auto-tagging)
- [ ] Mobile native apps (React Native)
- [ ] Multi-language expansion
- [ ] Advanced watermarking options
- [ ] Event templates and themes
- [ ] Integration with external calendar services

### Technical Improvements
- [ ] GraphQL API migration
- [ ] Redis caching layer
- [ ] Advanced search and filtering
- [ ] Real-time collaboration features
- [ ] Advanced user permissions
- [ ] API rate limiting and throttling
- [ ] Comprehensive logging and monitoring
- [ ] Automated testing suite

## 🤝 Contributing

### Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Start development server: `npm run dev`
5. Start backend server: `npm run server`

### Code Quality
- Run linting: `npm run lint`
- Run tests: `npm test`
- Build for production: `npm run build`
- Preview production build: `npm run preview`

### Deployment
- Use `deploy.sh` for production deployment
- Monitor with PM2: `pm2 logs snapify`
- Check health: `curl http://localhost:3001/api/health`

## 📞 Support & Contact

For development questions, feature requests, or bug reports, please refer to the project documentation or contact the development team.

---

**Last Updated**: November 26, 2025 at 16:19 UTC
**Version**: 2.2
**Status**: Production Ready