# API Validation Script

This script validates all API endpoints and credentials configured in your `.env.local` file for the development environment.

## Purpose

- Test connectivity to each API service
- Validate API keys and tokens
- Identify misconfigured or inaccessible endpoints
- Generate a comprehensive validation report

## Usage

```bash
# Run the validation script
node scripts/validate-apis.js
```

## Prerequisites

Make sure you have the required dependencies:

```bash
npm install dotenv
```

Or if using the project's existing dependencies:

```bash
npm install
```

## What Gets Validated

The script tests the following API categories:

### Database & Storage
- PostgreSQL Database (URL format validation)
- AWS Services (credentials and region)
- API Gateway endpoint accessibility
- S3 Bucket accessibility
- CloudFront CDN accessibility
- Cognito User Pool configuration
- Supabase connection

### Payment Services
- ASAAS Payment API

### AI & Machine Learning
- Gemini API (Google)
- NREL Solar API
- OpenAI API
- Claude API (Anthropic)
- Groq API
- DeepSeek API
- Cohere API
- OpenRouter API
- Mistral API
- Hugging Face API
- Ollama (local LLM)

### Email & Communication
- Resend Email API
- Sentry error tracking
- PostHog analytics

### Geospatial & Mapping
- CesiumJS token
- MapTiler API
- Sentinel Hub

### Development Tools
- Firecrawl API
- Roboflow API
- GitHub tokens (fine-grained and classic)
- GitLab token
- Vercel API
- E2B API

### Weather Services
- OpenWeatherMap API

## Output Format

The script provides color-coded output:
- **Green** (✓ PASS): API is accessible and/or credentials are valid
- **Red** (✗ FAIL): API is inaccessible or credentials are invalid
- **Yellow**: In-progress tests
- **Cyan**: Additional details about the test result

## Summary Report

After all tests complete, a summary is displayed showing:
- Total number of tests
- Number of passed tests
- Number of failed tests
- Detailed list of failures
- Detailed list of successes

## Exit Codes

- `0`: All validations passed
- `1`: One or more validations failed

## Notes

1. **Rate Limiting**: The script includes a 500ms delay between tests to avoid rate limiting issues.

2. **Security**: This script only reads environment variables and makes test requests. It does NOT modify any credentials.

3. **Local Services**: Some services like Ollama require local servers to be running.

4. **API Keys with Special Characters**: Some API keys in the `.env.local` file have special naming conventions. The script attempts to read both standard and alternate variable names.

5. **Production vs Development**: This script is designed for the **development environment**. Do NOT run this against production credentials unless you're specifically testing production.

## Troubleshooting

### "MODULE_NOT_FOUND" Error
Make sure `dotenv` is installed:
```bash
npm install dotenv
```

### Timeout Errors
Some APIs may be slow to respond. You can increase the timeout in the script by modifying the `timeout` parameter in the `makeRequest` function.

### 401 Unauthorized
This means the API key is invalid or missing. Check your `.env.local` file for the correct credentials.

### 403 Forbidden
The API endpoint exists but you don't have permission. This may be expected behavior for some endpoints.

## Adding New API Tests

To add a new API test, add an entry to the `apiTests` object in `validate-apis.js`:

```javascript
'My New API': async () => {
  const key = process.env.MY_API_KEY;
  if (!key) {
    throw new Error('MY_API_KEY not configured');
  }
  const response = await makeRequest('https://api.example.com/endpoint', {
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });
  return `Status: ${response.statusCode} (Auth ${response.statusCode === 200 ? 'valid' : 'invalid'})`;
},
```

## Revoking in Production

**IMPORTANT**: The credentials in `.env.local` are for **development only**. Before deploying to production:

1. Review all API keys in `.env.local`
2. Replace development keys with production keys in `.env.production`
3. Revoke any development keys that were accidentally exposed
4. Never commit `.env.local` to version control
5. Use AWS Secrets Manager or similar for production secrets management

## License

This script is part of the Yello Solar Hub project.
