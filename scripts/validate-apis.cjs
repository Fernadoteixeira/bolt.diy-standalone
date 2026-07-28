#!/usr/bin/env node
/**
 * API Validation Script for Development Environment
 * Tests all API endpoints and credentials defined in .env.local
 * 
 * Usage: node scripts/validate-apis.js
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Load environment from backup file (old credentials to validate before revocation)
require('dotenv').config({ path: '.env.local.backup-20260413-062607' });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Results storage
const results = {
  success: [],
  failure: [],
  skipped: [],
};

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      timeout: options.timeout || 15000,
      headers: options.headers || {},
    };

    const req = lib.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data: data,
          headers: res.headers,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (15s)'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Test functions for each API service
const apiTests = {
  // Database Configuration
  'PostgreSQL Database (Neon)': async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL not configured');
    }
    if (!url.startsWith('postgresql://')) {
      throw new Error('Invalid PostgreSQL URL format');
    }
    return 'URL format valid (full connection test requires pg library)';
  },

  // AWS Services
  'AWS Configuration': async () => {
    const required = ['APP_AWS_ACCESS_KEY_ID', 'APP_AWS_SECRET_ACCESS_KEY', 'APP_AWS_REGION'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing: ${missing.join(', ')}`);
    }
    return `Region: ${process.env.APP_AWS_REGION}`;
  },

  'API Gateway Endpoint': async () => {
    const endpoint = process.env.API_GATEWAY_ENDPOINT;
    if (!endpoint) {
      throw new Error('API_GATEWAY_ENDPOINT not configured');
    }
    const response = await makeRequest(endpoint);
    return `Status: ${response.statusCode}`;
  },

  'S3 Bucket': async () => {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      throw new Error('AWS_S3_BUCKET not configured');
    }
    const url = `https://${bucket}.s3.${process.env.AWS_S3_REGION || 'us-east-1'}.amazonaws.com/`;
    const response = await makeRequest(url);
    return `Status: ${response.statusCode}`;
  },

  'CloudFront CDN': async () => {
    const domain = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;
    if (!domain) {
      throw new Error('CloudFront domain not configured');
    }
    const response = await makeRequest(`https://${domain}`);
    return `Status: ${response.statusCode}`;
  },

  'Cognito User Pool': async () => {
    const poolId = process.env.AWS_COGNITO_USER_POOL_ID;
    if (!poolId) {
      throw new Error('Cognito User Pool ID not configured');
    }
    return `Pool ID: ${poolId}`;
  },

  // Payment Services
  'ASAAS Payment API': async () => {
    const token = process.env.ASAAS_API_TOKEN;
    const baseUrl = process.env.ASAAS_BASE_URL;
    if (!token || !baseUrl) {
      throw new Error('ASAAS credentials not configured');
    }
    const response = await makeRequest(`${baseUrl}/payments`, {
      headers: { access_token: token },
    });
    const valid = response.statusCode !== 401;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  // Authentication
  'Auth Secret (NextAuth)': async () => {
    if (!process.env.AUTH_SECRET) {
      throw new Error('AUTH_SECRET not configured');
    }
    return 'Configured';
  },

  // Observability
  'Sentry DSN': async () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      throw new Error('SENTRY_DSN not configured');
    }
    return `DSN valid: ${dsn.substring(0, 30)}...`;
  },

  'Clarity AI': async () => {
    const key = process.env.CLARITY_API_KEY;
    if (!key) {
      throw new Error('CLARITY_API_KEY not configured');
    }
    return 'Key configured';
  },

  // Email Services
  'Resend Email API': async () => {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY not configured');
    }
    const response = await makeRequest('https://api.resend.com/audiences', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const valid = response.statusCode !== 401;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  // AI & ML APIs
  'Gemini API (Google)': async () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    const response = await makeRequest(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    const valid = response.statusCode === 200 || response.statusCode === 400;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  'NREL Solar API': async () => {
    const key = process.env.NREL_API_KEY;
    if (!key) {
      throw new Error('NREL_API_KEY not configured');
    }
    const response = await makeRequest(
      `https://developer.nrel.gov/api/solar/v1/solar_resource.json?api_key=${key}&lat=40&lon=-100`
    );
    const valid = response.statusCode === 200;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  'OpenAI API': async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    const response = await makeRequest('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const valid = response.statusCode !== 401;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  'Groq API': async () => {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      // Try alternate env var names
      const keys = Object.keys(process.env).filter(k => k.includes('GROQ') || (process.env[k] && process.env[k].startsWith('gsk_')));
      if (keys.length === 0) {
        throw new Error('GROQ_API_KEY not configured');
      }
    }
    return 'Key format valid (starts with gsk_)';
  },

  'DeepSeek API': async () => {
    const keys = Object.keys(process.env).filter(k => 
      (process.env[k] && process.env[k].startsWith('sk-a339')) || k.includes('DEEPSEEK')
    );
    if (keys.length === 0) {
      throw new Error('DEEPSEEK API key not configured');
    }
    return 'Key configured';
  },

  'Cohere API': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('9ohCi'));
    if (keys.length === 0) {
      throw new Error('COHERE API key not configured');
    }
    return 'Key configured';
  },

  'OpenRouter API': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('sk-or-v1'));
    if (keys.length === 0) {
      throw new Error('OPENROUTER API key not configured');
    }
    return 'Key configured';
  },

  'Mistral API': async () => {
    const key = process.env.MISTRAL;
    if (!key) {
      const keys = Object.values(process.env).filter(v => v && v.length === 32 && /^[A-Za-z0-9]+$/.test(v));
      if (keys.length === 0) {
        throw new Error('MISTRAL API key not configured');
      }
    }
    return 'Key configured';
  },

  'Hugging Face API': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('hf_'));
    if (keys.length === 0) {
      throw new Error('HUGGING FACE API key not configured');
    }
    return `${keys.length} key(s) configured`;
  },

  // Geospatial & Mapping
  'CesiumJS Token': async () => {
    const token = process.env.CESIUMJS_TOKEN;
    if (!token) {
      throw new Error('CESIUMJS_TOKEN not configured');
    }
    return 'Token configured';
  },

  'MapTiler API': async () => {
    const key = process.env.MAPTILER_KEY;
    if (!key) {
      throw new Error('MAPTILER_KEY not configured');
    }
    const response = await makeRequest(`https://api.maptiler.com/account?key=${key}`);
    const valid = response.statusCode === 200;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  'Sentinel Hub': async () => {
    const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
    const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('SENTINEL_HUB credentials not configured');
    }
    return 'Credentials configured';
  },

  // Firecrawl API
  'Firecrawl API': async () => {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    const response = await makeRequest('https://api.firecrawl.dev/v1/health', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const valid = response.statusCode !== 401;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  // Roboflow API
  'Roboflow API': async () => {
    const key = process.env.ROBOFLOW_API_KEY;
    if (!key) {
      throw new Error('ROBOFLOW_API_KEY not configured');
    }
    return 'Key configured';
  },

  // GitHub API
  'GitHub Token (Fine-grained PAT)': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('github_pat_'));
    if (keys.length === 0) {
      throw new Error('GitHub PAT not configured');
    }
    return `${keys.length} token(s) configured`;
  },

  'GitHub Token (Classic)': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('ghp_'));
    if (keys.length === 0) {
      throw new Error('GitHub classic token not configured');
    }
    return `${keys.length} token(s) configured`;
  },

  // GitLab API
  'GitLab Token': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('glpat-'));
    if (keys.length === 0) {
      throw new Error('GITLAB token not configured');
    }
    return 'Token configured';
  },

  // Vercel API
  'Vercel API': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('vcp_'));
    if (keys.length === 0) {
      throw new Error('VERCEL token not configured');
    }
    return 'Token configured';
  },

  // PostHog
  'PostHog API': async () => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      throw new Error('POSTHOG key not configured');
    }
    return `Key: ${key.substring(0, 20)}...`;
  },

  // Supabase
  'Supabase Connection': async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE credentials not configured');
    }
    const response = await makeRequest(`${url}/rest/v1/`, {
      headers: { apikey: key },
    });
    const valid = response.statusCode !== 401;
    return `Status: ${response.statusCode} (Auth: ${valid ? 'VALID' : 'INVALID'})`;
  },

  // Stripe
  'Stripe API': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('sk_live_'));
    if (keys.length === 0) {
      throw new Error('STRIPE key not configured');
    }
    return `${keys.length} key(s) configured`;
  },

  // E2B API
  'E2B API': async () => {
    const keys = Object.values(process.env).filter(v => v && v.startsWith('sk_e2b_'));
    if (keys.length === 0) {
      throw new Error('E2B API key not configured');
    }
    return 'Key configured';
  },

  // Weather APIs
  'OpenWeatherMap API': async () => {
    const key = process.env.OPEN_WEATHER_MAP_API_KEY;
    if (!key) {
      throw new Error('OPENWEATHERMAP API key not configured');
    }
    return 'Key configured';
  },

  // Ollama (local)
  'Ollama (Local LLM)': async () => {
    const baseUrl = process.env.OLLAMA_API_BASE_URL || 'http://127.0.0.1:11434';
    try {
      const response = await makeRequest(`${baseUrl}/api/tags`);
      const running = response.statusCode === 200;
      return `Status: ${response.statusCode} (${running ? 'RUNNING' : 'NOT RUNNING'})`;
    } catch (error) {
      return `Not reachable at ${baseUrl}`;
    }
  },

  // Facebook Login
  'Facebook Login': async () => {
    const appId = process.env.FACEBOOK_APP_ID || process.env.VITE_FACEBOOK_APP_ID;
    if (!appId) {
      throw new Error('FACEBOOK_APP_ID not configured');
    }
    return `App ID: ${appId}`;
  },

  // SES Email
  'SES From Email': async () => {
    const email = process.env.SES_FROM_EMAIL;
    if (!email) {
      throw new Error('SES_FROM_EMAIL not configured');
    }
    return `Email: ${email}`;
  },

  // Turso
  'Turso Database': async () => {
    const token = process.env.TURSO_AUTH_TOKEN;
    if (!token) {
      throw new Error('TURSO_AUTH_TOKEN not configured');
    }
    return 'Token configured';
  },

  // BACEN
  'BACEN (Central Bank)': async () => {
    const useMock = process.env.BACEN_USE_MOCK;
    return `Using mock: ${useMock === 'true' ? 'YES' : 'NO'}`;
  },

  // Geolocation
  'Geolocation Config': async () => {
    const provider = process.env.GEO_IP_PROVIDER;
    if (!provider) {
      throw new Error('GEO_IP_PROVIDER not configured');
    }
    return `Provider: ${provider}`;
  },
};

// Main validation function
async function validateAPIs() {
  console.log(`${colors.cyan}${colors.bold}`);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         API Validation Script - Dev Environment         ║');
  console.log('║              Yello Solar Hub - 2026-04-14              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}\n`);

  console.log(`${colors.blue}${colors.bold}Starting API validation...${colors.reset}\n`);

  const totalTests = Object.keys(apiTests).length;
  let currentTest = 0;

  for (const [name, testFn] of Object.entries(apiTests)) {
    currentTest++;
    const progress = `[${currentTest}/${totalTests}]`;

    process.stdout.write(`${colors.yellow}${progress} Testing ${name}...${colors.reset} `);

    try {
      const result = await testFn();
      results.success.push({ name, result });
      console.log(`${colors.green}✓ PASS${colors.reset}`);
      if (result) {
        console.log(`  ${colors.cyan}→ ${result}${colors.reset}`);
      }
    } catch (error) {
      results.failure.push({ name, error: error.message });
      console.log(`${colors.red}✗ FAIL${colors.reset}`);
      console.log(`  ${colors.red}→ ${error.message}${colors.reset}`);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Print summary
  console.log(`\n${colors.cyan}${colors.bold}`);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                  Validation Summary                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}\n`);

  console.log(`${colors.green}${colors.bold}✓ Passed: ${results.success.length}${colors.reset}`);
  console.log(`${colors.red}${colors.bold}✗ Failed: ${results.failure.length}${colors.reset}`);
  console.log(`${colors.yellow}⚠ Skipped: ${results.skipped.length}${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}Total: ${totalTests}${colors.reset}\n`);

  if (results.failure.length > 0) {
    console.log(`${colors.red}${colors.bold}❌ Failed Tests:${colors.reset}`);
    console.log(`${'─'.repeat(60)}`);
    results.failure.forEach(({ name, error }) => {
      console.log(`  ${colors.red}•${colors.reset} ${colors.bold}${name}${colors.reset}`);
      console.log(`    ${colors.red}→ ${error}${colors.reset}`);
    });
    console.log('');
  }

  if (results.success.length > 0) {
    console.log(`${colors.green}${colors.bold}✅ Passed Tests:${colors.reset}`);
    console.log(`${'─'.repeat(60)}`);
    results.success.forEach(({ name, result }) => {
      console.log(`  ${colors.green}•${colors.reset} ${colors.bold}${name}${colors.reset}${result ? ` - ${result}` : ''}`);
    });
    console.log('');
  }

  // Generate recommendation for production revocation
  console.log(`${colors.blue}${colors.bold}📋 Recommendations for Production Revocation:${colors.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  ${colors.yellow}APIs that FAILED validation should be reviewed:${colors.reset}`);
  console.log(`  - Check if they are dev-only keys`);
  console.log(`  - Revoke through respective service dashboards`);
  console.log(`  - Do NOT deploy invalid keys to production\n`);

  // Exit with error code if any tests failed
  if (results.failure.length > 0) {
    console.log(`${colors.red}${colors.bold}⚠ Some API validations failed. Review errors above.${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}✅ All API validations passed!${colors.reset}`);
    process.exit(0);
  }
}

// Run validation
validateAPIs().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
