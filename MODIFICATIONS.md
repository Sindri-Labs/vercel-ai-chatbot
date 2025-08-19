# Vercel AI Chatbot - Modifications Guide

This document explains the modifications made to the original [Vercel AI Chatbot](https://github.com/vercel/ai-chatbot) template.

## 🚀 Quick Start

```bash
# Clone and navigate to the project
cd vercel-ai-chatbot

# Start the application with Docker Compose
./start_docker.sh

# Or start with Forge client proxy configuration
./start_docker_forge.sh
```

The application will be available at `http://localhost:3000`

## ⚠️ Important Note: Database Migrations

**Database migrations now run automatically** when the container starts up. The Docker setup has been configured to run migrations before starting the application, ensuring your database tables are always created.

If you need to run migrations manually:
```bash
# Run database migrations manually if needed
npm run db:migrate
```

## 🔧 Key Modifications from Original

### 1. **Docker Deployment**
- **Docker Compose**: Complete containerized setup with PostgreSQL and Redis
- **Custom Dockerfile**: Optimized for production deployment with automatic migrations
- **Start Scripts**: 
  - `start_docker.sh` - Standard Docker setup
  - `start_docker_forge.sh` - Forge client proxy configuration
- **No .env files**: All configuration via Docker environment variables
- **Automatic Migrations**: Database tables created automatically on container startup

### 2. **OpenAI SDK Configuration**
- **Switched from xAI to OpenAI**: Uses `@ai-sdk/openai` instead of `@ai-sdk/xai`
- **Custom Base URL**: Configurable via `OPENAI_BASE_URL` environment variable
- **Single Model Support**: Uses one model specified by `OPENAI_MODEL` environment variable
- **Compatible Mode**: Configured for third-party OpenAI-compatible providers
- **Model Validation**: Restricted to specific OpenAI model IDs (`gpt-3.5-turbo`, `gpt-4`, `gpt-4o`, `gpt-4o-mini`, `gpt2`)
- **Removed Test Models**: Eliminated test environment model configurations

### 3. **Sindri/EVLLMP Integration**
- **EVLLMP Proxy**: Added `sindrilabs/evllm-proxy:v0.0.8` service for Sindri integration
- **Configuration File**: `config.evllmp.yaml` for EVLLMP proxy settings
- **Forge Script**: `start_docker_forge.sh` for easy Forge client proxy setup
- **Sindri Support**: Direct integration with Sindri's OpenAI-compatible API
- **Flexible Configuration**: Can switch between OpenAI and Sindri endpoints

### 4. **Authentication & Authorization**
- **Middleware Changes**: Switched from `getToken` to `auth()` function
- **Page Exclusions**: Login and register pages explicitly excluded from authentication checks
- **Login/Register Redirects**: Fixed to redirect to home page after successful authentication
- **Guest Redirect**: Simplified redirect to `/api/auth/guest`
- **Auth Config**: Added `trustHost: true` for development
- **Debug Logging**: Added console logging to login actions for debugging

### 5. **API Route Enhancements**
- **Streaming Toggle**: `ENABLE_STREAMING` environment variable controls streaming vs non-streaming
- **Tools Toggle**: `USE_TOOLS` environment variable controls AI tools
- **Non-streaming Mode**: Added complete non-streaming implementation with proper response formatting
- **Enhanced Error Handling**: Improved error handling with better error codes and messages
- **Rate Limiting**: Improved rate limiting logic for different user types
- **Message Persistence**: Always saves messages for conversation continuity
- **Chat Ownership**: Enhanced chat visibility and ownership checks
- **Response Formatting**: Better handling of streaming vs non-streaming response formats

### 6. **File Upload Enhancements**
- **PDF Support**: Added `application/pdf` to supported file types
- **JSON Support**: Added `application/json` to supported file types
- **Enhanced Validation**: Updated file type validation in both schema and upload routes
- **Error Response**: Improved error response format for unauthorized uploads
- **Increased File Size Limit**: **Increased from 5MB to 100MB** for larger uploads

### 7. **Rate Limiting & User Entitlements**
- **Guest User Rate Limiting**: **20 messages per day** (not unlimited as previously documented)
- **Regular User Rate Limiting**: **100 messages per day** for registered users
- **User Type Detection**: Proper rate limiting based on user authentication status
- **Enhanced User Experience**: Better rate limiting logic and error handling

### 8. **Database & Environment**
- **Removed dotenv**: No longer depends on `.env` files (removed from multiple files)
- **Docker Environment**: All configuration via Docker environment variables
- **Migration Handling**: Separated database migration from build process
- **Type Imports**: Fixed type import issues in entitlements

### 9. **Component & Page Changes**
- **Chat Page**: Simplified chat creation, removed DataStreamHandler, added React import
- **Chat Component**: Enhanced request body preparation with better message handling
- **Chat Header**: Improved new chat handling with dedicated function
- **History API**: Enhanced error handling and response format

## 📋 Environment Variables

The following environment variables are configured via Docker Compose:

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SECRET` | Auto-generated | JWT encryption secret (regenerated each restart) |
| `OPENAI_API_KEY` | From `../API_KEY` | Your OpenAI API key |
| `OPENAI_BASE_URL` | `http://host.docker.internal:4090/v1` | Custom OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model to use for chat completions |
| `PORT` | `3000` | Port for the web application |
| `MAX_COMPLETION_TOKENS` | `1000` | Maximum tokens for responses |
| `USE_TOOLS` | `false` | Enable AI tools (weather, documents, etc.) |
| `ENABLE_STREAMING` | `true` | Enable streaming responses |
| `SINDRI_BASE_URL` | `https://sindri.app/api/ai/v1/openai` | Sindri OpenAI-compatible endpoint |
| `BLOB_READ_WRITE_TOKEN` | Optional | Vercel Blob storage token for file uploads |

## 🐳 Docker Services

The application runs with the following services:

- **Frontend**: Next.js application (port 3000) with automatic database migrations
- **PostgreSQL**: Database for user data and chat history
- **Redis**: Session storage and caching
- **EVLLMP Proxy**: Sindri integration service (optional)
- **Vercel Blob**: File storage (optional)

## 🔍 Expected JWT Session Errors

**Note**: JWT session errors have been resolved by implementing AUTH_SECRET persistence.

### **Previous Behavior (Resolved):**
You may have seen JWT session errors in the logs when restarting the container:

```
[auth][error] JWTSessionError: no matching decryption secret
```

### **Current Behavior:**
- **AUTH_SECRET is persisted** in `.auth_secret` file
- **Sessions survive container restarts** - Users keep their current chat sessions
- **Clean logs** - No more JWT decryption errors
- **Better UX** - No unexpected session resets

### **How It Works:**
1. **First run**: New AUTH_SECRET generated and saved to `.auth_secret`
2. **Subsequent runs**: Existing AUTH_SECRET loaded from `.auth_secret`
3. **Sessions persist**: Redis sessions can be decrypted with the same secret
4. **Clean operation**: No more JWT errors in logs

**Note**: The `.auth_secret` file is automatically added to `.gitignore` for security.

## 🏗️ Detailed Changes

### **Files Added:**
- `.auth_secret` - Persistent AUTH_SECRET storage
- `.dockerignore` - Docker build exclusions
- `DOCKER_README.md` - Docker setup instructions
- `Dockerfile` - Container configuration with automatic migrations
- `docker-compose.yml` - Multi-service orchestration with migration commands
- `start_docker.sh` - Environment setup script
- `start_docker_forge.sh` - Forge client proxy setup script
- `config.evllmp.yaml` - EVLLMP proxy configuration for Sindri
- `MODIFICATIONS.md` - This documentation
- `global.d.ts` - Global TypeScript definitions

### **Files Modified:**

#### **Core Configuration:**
- `README.md` - Added Docker section, changed default model from xAI to OpenAI, added Sindri integration
- `package.json` - Switched from `@ai-sdk/xai` to `@ai-sdk/openai`, separated build scripts
- `tsconfig.json` - Added node types and global definitions
- `drizzle.config.ts` - Removed dotenv dependency
- `playwright.config.ts` - Removed dotenv dependency
- `.gitignore` - Added `.auth_secret` exclusion, simplified to only essential files

#### **Authentication:**
- `middleware.ts` - Complete rewrite: switched from `getToken` to `auth()`, added page exclusions
- `app/(auth)/auth.config.ts` - Added `trustHost: true` for development
- `app/(auth)/login/page.tsx` - Fixed redirect from `router.refresh()` to `router.push('/')`
- `app/(auth)/register/page.tsx` - Fixed redirect from `router.refresh()` to `router.push('/')`
- `app/(auth)/actions.ts` - Added debug logging for login attempts

#### **API Routes:**
- `app/(chat)/api/chat/route.ts` - Major enhancements:
  - Added streaming/non-streaming toggle with `ENABLE_STREAMING`
  - Added tools toggle with `USE_TOOLS`
  - Enhanced error handling with better error codes
  - Improved message persistence and chat ownership checks
  - **Rate limiting applies to all users** - Guest users get 20 messages/day, regular users get 100/day
  - Non-streaming mode with proper response formatting
- `app/(chat)/api/chat/schema.ts` - Added PDF and JSON support, removed message length limits
- `app/(chat)/api/files/upload/route.ts` - **Increased file size limit to 100MB**, added PDF support, improved error responses
- `app/(chat)/api/history/route.ts` - Enhanced error handling and response format

#### **Components & Pages:**
- `app/(chat)/page.tsx` - Simplified chat creation, removed DataStreamHandler, added React import
- `components/chat.tsx` - Enhanced request body preparation with better message handling
- `components/chat-header.tsx` - Improved new chat handling with dedicated function

#### **AI Configuration:**
- `lib/ai/providers.ts` - Complete rewrite for OpenAI SDK:
  - Removed xAI and test model configurations
  - Added OpenAI provider with custom base URL
  - Model validation for specific OpenAI models
  - Environment variable configuration
- `lib/ai/entitlements.ts` - Fixed type imports, maintained rate limiting for all user types

#### **Database:**
- `lib/db/helpers/01-core-to-parts.ts` - Removed dotenv dependency
- `lib/db/migrate.ts` - Removed dotenv dependency

### **Files Removed:**
- `.env.example` - No longer needed with Docker setup
- `lib/ai/models.test.ts` - Replaced with `models.test.ts.bak`
- `.eslintrc.json` - Replaced with Biome configuration
- Multiple development configuration files

## 🚀 Deployment

### Local Development
```bash
# Standard Docker setup
./start_docker.sh

# Forge client proxy setup
./start_docker_forge.sh
```

### Production
1. Set up your environment variables in `docker-compose.yml`
2. Ensure your OpenAI-compatible endpoint is accessible
3. Deploy using your preferred container orchestration platform

## 🔄 Recent Updates

### **Sindri/EVLLMP Integration (Latest)**
- **EVLLMP Proxy Service**: Added dedicated service for Sindri integration
- **Forge Configuration**: New script for easy Forge client proxy setup
- **Flexible Endpoints**: Can switch between OpenAI and Sindri APIs
- **Enhanced Configuration**: `config.evllmp.yaml` for proxy settings

### **File Upload & Rate Limiting Updates**
- **File Size Limit**: **Increased from 5MB to 100MB** for all file uploads
- **File Type Support**: Added PDF and JSON file type support
- **Rate Limiting**: **Guest users get 20 messages/day, regular users get 100/day**
- **Better User Experience**: Improved file handling and rate limiting logic

### **Key Changes Made:**
1. **File Upload Route** (`app/(chat)/api/files/upload/route.ts`):
   - Increased file size validation from `5 * 1024 * 1024` to `100 * 1024 * 1024` bytes
   - Added `application/pdf` to supported file types
   - Updated error message to reflect new 100MB limit

2. **Chat API Route** (`app/(chat)/api/chat/route.ts`):
   - Rate limiting logic applies to all user types
   - Guest users get 20 messages/day, regular users get 100/day
   - Enhanced error handling for different user types

3. **Entitlements** (`lib/ai/entitlements.ts`):
   - Guest users: 20 messages/day
   - Regular users: 100 messages/day

4. **New Services**:
   - `evllmp` service for Sindri integration
   - `start_docker_forge.sh` script for Forge setup
   - `config.evllmp.yaml` configuration file

### **Benefits:**
- **Larger File Support**: Users can upload files up to 100MB (20x increase from original)
- **Sindri Integration**: Direct support for Sindri's OpenAI-compatible API
- **Better File Compatibility**: Support for PDF and JSON documents
- **Flexible Configuration**: Easy switching between different AI providers
- **Improved UX**: Better file handling and rate limiting

### **Technical Details:**
- **File Size**: 100MB limit enforced at API level with Zod validation
- **Rate Limiting**: Applied to all user types with different limits
- **File Types**: JPEG, PNG, PDF, and JSON supported
- **Sindri Support**: Full EVLLMP proxy integration
- **Backward Compatibility**: Existing functionality preserved

## 📚 Original Documentation

For more information about the original Vercel AI Chatbot features, visit:
- [Original Repository](https://github.com/vercel/ai-chatbot)
- [Chat SDK Documentation](https://chat-sdk.dev)

## 🤝 Contributing

This is a modified version of the Vercel AI Chatbot. For contributions to the original project, please visit the [main repository](https://github.com/vercel/ai-chatbot).

## 📄 License

This project is based on the Vercel AI Chatbot template. See the [LICENSE](LICENSE) file for details.

# Streaming Configuration
- **ENABLE_STREAMING**: Controls whether to use streaming or non-streaming mode
  - Default: `true` (streaming enabled)
  - Set to `false` to disable streaming if needed
  - Streaming mode provides real-time response generation
  - Non-streaming mode waits for complete response before sending
