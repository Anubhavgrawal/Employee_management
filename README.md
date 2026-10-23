# Employee Management API

Secure TypeScript and Express REST API for employee records, role-based access control, authentication, departments, audit logs, and employee document storage.

## Features

- JWT access tokens with issuer, audience, expiry, and HS256 validation
- Refresh-token rotation and session management
- Argon2id password hashing
- One-time invitation flow for new employee accounts
- Role-based access control for `admin`, `hr`, `manager`, and `employee`
- Employee, department, and document management
- Audit logging for authentication and important mutations
- Request validation with Zod
- PostgreSQL persistence with TypeORM migrations
- Jest middleware tests and Vitest service/document tests

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer
- Optional: an S3-compatible object-storage service for documents

## Installation

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Update `.env` before starting the application:

- Set `DATABASE_URL` to a working PostgreSQL connection.
- Replace the JWT placeholder with a random secret of at least 32 characters.
- Set `SEED_PASSWORD` to a development password of at least 12 characters when using the seed command.
- Keep `.env` local. It is ignored by Git.

Example secret generation:

```bash
openssl rand -hex 32
```

Create the configured PostgreSQL database before running migrations.

## Database Setup

Apply all migrations:

```bash
npm run migration:run
```

Create development accounts and the `Engineering` department:

```bash
npm run seed
```

The seed is safe to rerun. It creates or updates one account for each supported role:

- `admin@example.test`
- `hr@example.test`
- `manager@example.test`
- `employee@example.test`

All seeded accounts use the value of `SEED_PASSWORD`. The seed refuses to run when `NODE_ENV=production`.

## Running the API

Development mode:

```bash
npm run dev
```

Build and start the compiled application:

```bash
npm run build
npm start
```

The default server URL is `http://localhost:3000`.

Health check:

```http
GET /health
```

## Authentication Workflow

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
	"email": "admin@example.test",
	"password": "<SEED_PASSWORD>"
}
```

The response contains an `accessToken`, `refreshToken`, `sessionId`, and expiry information. Send the access token on protected routes:

```http
Authorization: Bearer <access-token>
```

### Create an account

Admins and HR users with `employee:create` can create employee records. The request creates a linked login account and returns a one-time invitation token. HR can create the default `employee` role; only an administrator can assign `hr`, `manager`, or `admin`.

```http
POST /api/v1/employees
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
	"firstName": "Jane",
	"lastName": "Doe",
	"workEmail": "jane.doe@example.test",
	"departmentId": "<department-uuid>",
	"jobTitle": "Software Engineer",
	"joiningDate": "2026-10-22",
	"role": "employee"
}
```

The successful `201` response includes `data.employee` and `data.account`. The account data contains the login email, role, one-time invitation token, and invitation expiry. Do not log or expose the invitation token unnecessarily.

### Activate an invitation

The new employee chooses their own password using the invitation token:

```http
POST /api/v1/auth/activate
Content-Type: application/json
```

```json
{
	"invitationToken": "<one-time-token>",
	"newPassword": "<strong-password>"
}
```

Passwords must be at least 12 characters and include uppercase, lowercase, and numeric characters. The invitation token is single-use and expires after 24 hours.

### Password and sessions

- `POST /api/v1/auth/change-password` changes the current password and revokes all sessions.
- `POST /api/v1/auth/refresh` rotates a refresh token.
- `POST /api/v1/auth/logout` revokes the supplied session token.
- `POST /api/v1/auth/logout-all` revokes all sessions for the current user.
- `GET /api/v1/auth/sessions` lists active sessions.
- `DELETE /api/v1/auth/sessions/:id` revokes one session.

## Roles and Permissions

| Role | Permissions and scope |
| --- | --- |
| `admin` | All configured permissions; can assign elevated roles and manage all records |
| `hr` | Read, create, update, and deactivate employees; manage departments; cannot assign elevated roles |
| `manager` | Read employees and update employees within the manager's direct-report scope |
| `employee` | Own profile and own permitted document operations |

Common employee routes:

- `GET /api/v1/employees`
- `POST /api/v1/employees`
- `GET /api/v1/employees/me`
- `PATCH /api/v1/employees/me`
- `GET /api/v1/employees/:id`
- `PATCH /api/v1/employees/:id`
- `DELETE /api/v1/employees/:id`

Department routes:

- `GET /api/v1/departments`
- `POST /api/v1/departments`
- `PATCH /api/v1/departments/:id`

Document routes require authentication and use multipart form data for uploads:

- `POST /api/v1/employees/:id/documents` with file field `file`
- `GET /api/v1/employees/:id/documents`
- `GET /api/v1/documents/:id/download-url`
- `DELETE /api/v1/documents/:id`

## Response Format

Successful responses use this envelope:

```json
{
	"success": true,
	"message": "...",
	"data": {},
	"requestId": "..."
}
```

Errors use this envelope:

```json
{
	"success": false,
	"message": "...",
	"code": "...",
	"details": {},
	"requestId": "..."
}
```

## Testing

Run the existing document tests with Vitest:

```bash
npm test
```

Run Jest authentication and authorization middleware tests:

```bash
npm run test:jest
```

Run both test suites:

```bash
npm run test:all
```

The tests generate JWTs directly and do not call the login API or require PostgreSQL for middleware coverage.

Run the TypeScript build:

```bash
npm run build
```

## API Documentation

- OpenAPI specification: [openapi.yaml](openapi.yaml)
- Postman collection: [employee-management.postman_collection.json](employee-management.postman_collection.json)

Never commit `.env`, real passwords, JWT secrets, invitation tokens, or database credentials.
