// Loaded before each test file, before the app (and its env validation) is imported.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:54329/wildlen_test'
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234'
process.env.PUBLIC_URL = 'http://localhost:3000'
process.env.CLOUDINARY_CLOUD_NAME = ''
process.env.CLOUDINARY_KEY = ''
process.env.CLOUDINARY_SECRET = ''
