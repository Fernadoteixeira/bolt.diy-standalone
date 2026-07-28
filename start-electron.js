#!/usr/bin/env node

/**
 * Bolt.diy Default Startup Script
 * 
 * This is the default entry point for Bolt.diy.
 * It starts the application using Electron Desktop by default.
 * 
 * For web-only mode, use: pnpm run start:web
 * For Docker mode, use: pnpm run dockerstart
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.STARTUP_MODE = 'electron';

console.log('🚀 Bolt.diy - Starting in Electron Desktop mode...');
console.log('🔧 Environment:', process.env.NODE_ENV);
console.log('📱 Startup Mode: Electron (Desktop App)');

/**
 * Check if Electron build exists
 */
function electronBuildExists() {
  const mainPath = path.join(__dirname, 'build', 'electron', 'main', 'index.mjs');
  const preloadPath = path.join(__dirname, 'build', 'electron', 'preload', 'index.cjs');
  
  return fs.existsSync(mainPath) && fs.existsSync(preloadPath);
}

/**
 * Build Electron dependencies if needed
 */
async function ensureElectronBuild() {
  if (electronBuildExists()) {
    console.log('✅ Electron build found');
    return;
  }

  console.log('📦 Building Electron dependencies for the first time...');
  
  return new Promise((resolve, reject) => {
    const buildProcess = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'electron:build:deps'],
      {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env },
      }
    );

    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Electron dependencies built successfully');
        resolve();
      } else {
        reject(new Error(`Build failed with exit code: ${code}`));
      }
    });

    buildProcess.on('error', (error) => {
      reject(new Error(`Build process error: ${error.message}`));
    });
  });
}

/**
 * Start Electron application
 */
async function startElectron() {
  try {
    // Ensure Electron build exists
    await ensureElectronBuild();

    // Start Remix dev server in background
    console.log('🌐 Starting Remix development server...');
    const remixProcess = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'dev'],
      {
        stdio: 'pipe',
        shell: true,
        env: { ...process.env },
      }
    );

    let remixStarted = false;

    remixProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (!remixStarted && output.includes('ready')) {
        console.log('✅ Remix server ready');
        remixStarted = true;
      }
    });

    remixProcess.stderr.on('data', (data) => {
      console.error(`[Remix] ${data.toString().trim()}`);
    });

    // Wait for Remix to start
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Start Electron
    console.log('⚡ Starting Electron application...');
    
    const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
    const mainPath = path.join(__dirname, 'build', 'electron', 'main', 'index.mjs');

    const electronProcess = spawn(electronPath, [mainPath], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV,
        ELECTRON_IS_DEV: process.env.NODE_ENV === 'development' ? '1' : '0',
      },
    });

    electronProcess.on('error', (error) => {
      console.error('❌ Failed to start Electron:', error);
      remixProcess.kill('SIGTERM');
      process.exit(1);
    });

    electronProcess.on('exit', (code) => {
      console.log('📱 Electron exited with code:', code);
      remixProcess.kill('SIGTERM');
      process.exit(code);
    });

    console.log('🎉 Bolt.diy Desktop App started successfully!');
    console.log('💡 The app window should appear shortly');
    console.log('🛑 Press Ctrl+C to exit');

  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle process exit signals
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

// Start the application
startElectron();
