<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1kvWYjORMCO0P8BiILclB3UspWknIBBvq

## Run Locally

**Prerequisites:**
- Node.js (v18+)
- Redis (optional, for enhanced caching)
- SQLite3

### Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   - Copy `.env.example` to `.env.local`
   - Set required API keys:
     - `GEMINI_API_KEY` - Your Gemini API key
     - `SENTRY_DSN` - Sentry DSN for error monitoring (optional)
     - `REDIS_HOST`, `REDIS_PORT` - Redis configuration (optional)

3. Run the app:
   ```bash
   npm run dev
   ```

### Development Commands

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run server only
npm run server
```

### Infrastructure Features

This application includes enterprise-grade infrastructure:

- **Caching**: Redis-backed caching with automatic fallback to in-memory cache
- **Logging**: Structured logging with Winston for better debugging
- **Monitoring**: Sentry integration for error tracking and performance monitoring
- **Testing**: Comprehensive test suite with Jest and React Testing Library

### Production Deployment

For production deployment, ensure you have:

1. **Redis Server** (recommended for performance)
2. **Sentry Account** for error monitoring
3. **Strong JWT Secret** and other security credentials

See `DEPLOYMENT.md` for detailed deployment instructions.
