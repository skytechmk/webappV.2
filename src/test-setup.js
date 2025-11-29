// Global test setup
// This file runs before all tests
export default async function globalSetup() {
    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret';

    // Mock environment for Vite
    global.import = {
        meta: {
            env: {
                DEV: true,
                VITE_API_URL: 'http://localhost:3001'
            }
        }
    };
}