# E2E Tests - Web-Next

This directory contains Playwright end-to-end tests for the web-next application.

## Setup

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials
   - Or copy from the main web app: `cp ../web/.env.local .env.local`

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Playwright Configuration
BASE_URL=http://localhost:5173
VERCEL_AUTOMATION_BYPASS_SECRET=
```

## Running Tests

### Install Playwright browsers (first time only)
```bash
npx playwright install
```

### Run tests
```bash
# Run all tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests with UI
npm run test:e2e:ui
```

### Test Structure

- `tests/` - Test files
- `fixtures/` - Test data files (JSON fixtures for bulk upload tests)
- `utils/` - Test utilities and helpers

## Test Categories

### Authentication
- User registration
- User login
- User logout

### Transactions
- Create transactions (spend, earn, save)
- Edit transactions
- Delete transactions

### Settings
- Categories management
- Tags management
- Bank accounts management

### Data Management
- Bulk upload
- Data reset

### Security
- Multi-user data isolation
- Row-level security verification

## Architecture

The web-next application uses:
- **Framework**: Vite + React Router + Refine
- **UI Library**: Ant Design
- **Testing**: Playwright
- **Backend**: Supabase (shared with main web app)

Test utilities are shared with the main web application where possible, but selectors and UI interactions are adapted for the Refine + Ant Design stack.

## Adapting Tests from Web App

When porting tests from `../web/e2e/tests/`, key differences to consider:

1. **Routing**:
   - Web app: `/spend`, `/earn`, `/save`
   - Web-next: `/transactions` (unified)

2. **UI Components**:
   - Web app: Custom components
   - Web-next: Ant Design components

3. **Test IDs**:
   - Web app: `spend-form-amount`
   - Web-next: Need to add `data-testid` attributes or use Ant Design selectors

4. **Forms**:
   - Web app: Separate forms per transaction type
   - Web-next: Single form with type dropdown

## Notes

- Tests run sequentially to ensure data isolation
- Each test creates its own test user and cleans up after itself
- Shared Supabase backend means test data setup is identical to web app
- See the main project README for more information
