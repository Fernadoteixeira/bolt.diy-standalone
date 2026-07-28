/**
 * E2E Tests for Multi-Agent Workflows and Swarm Orchestration
 * 
 * These tests validate complex multi-agent scenarios including:
 * - Agent coordination and collaboration
 * - Task distribution and load balancing
 * - Error handling and recovery
 * - Artifact management across agents
 * 
 * Run with: pnpm test:e2e (requires Playwright)
 */

import { test, expect, type Page } from '@playwright/test';

// Test fixtures
interface AgentState {
  id: string;
  role: string;
  status: 'idle' | 'working' | 'done' | 'error';
}

interface TaskState {
  id: string;
  description: string;
  assignedTo: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

test.describe('Multi-Agent Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Agent Orchestration', () => {
    test('should coordinate multiple agents on a complex task', async ({ page }) => {
      // Navigate to chat
      await page.goto('/chat');

      // Trigger multi-agent workflow
      await page.fill('[data-testid="chat-input"]', 'Create a React component with tests');
      await page.click('[data-testid="send-button"]');

      // Wait for orchestrator to assign tasks
      await page.waitForSelector('[data-testid="agent-orchestrator"]');

      // Wait for multiple agents to respond
      const agentResponses = await page.$$('[data-testid="agent-response"]');
      
      // Should have responses from multiple agents
      expect(agentResponses.length).toBeGreaterThan(1);

      // Verify task completion
      await page.waitForSelector('[data-testid="task-complete"]', { timeout: 30000 });
    });

    test('should handle agent failure and reassignment', async ({ page }) => {
      await page.goto('/chat');

      // Simulate agent failure scenario
      await page.evaluate(() => {
        window.localStorage.setItem('mock-agent-failure', 'true');
      });

      await page.reload();

      await page.fill('[data-testid="chat-input"]', 'Create an API endpoint');
      await page.click('[data-testid="send-button"]');

      // Wait for recovery
      await page.waitForSelector('[data-testid="agent-reassigned"]', { timeout: 15000 });

      // Verify task completed with backup agent
      const completedTasks = await page.$$('[data-testid="task-completed"]');
      expect(completedTasks.length).toBeGreaterThan(0);
    });

    test('should manage concurrent agent execution', async ({ page }) => {
      await page.goto('/chat');

      // Request parallel task execution
      await page.fill('[data-testid="chat-input"]', 'Create multiple components in parallel');
      await page.click('[data-testid="send-button"]');

      // Track concurrent execution
      const startTime = Date.now();

      // Wait for all parallel tasks
      await page.waitForSelector('[data-testid="all-tasks-complete"]', { timeout: 60000 });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify concurrent execution (should be faster than sequential)
      // If sequential: 3 tasks * 5s = 15s minimum
      // If concurrent: ~5-7s total
      expect(duration).toBeLessThan(15000);

      // Verify all tasks completed
      const taskStatus = await page.$$('[data-testid="task-status=completed"]');
      expect(taskStatus.length).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Swarm Communication', () => {
    test('should handle request-response pattern', async ({ page }) => {
      await page.goto('/chat');

      // Trigger request-response scenario
      await page.fill('[data-testid="chat-input"]', 'I need help with database schema');
      await page.click('[data-testid="send-button"]');

      // Wait for request
      await page.waitForSelector('[data-testid="agent-request"]');

      // Wait for response
      await page.waitForSelector('[data-testid="agent-response"]', { timeout: 15000 });

      // Verify conversation thread
      const messages = await page.$$('[data-testid="message"]');
      expect(messages.length).toBeGreaterThanOrEqual(2); // Request + Response
    });

    test('should handle broadcast announcements', async ({ page }) => {
      await page.goto('/chat');

      // Trigger broadcast
      await page.fill('[data-testid="chat-input"]', 'Deployment starting in 5 minutes');
      await page.click('[data-testid="send-button"]');

      // Wait for acknowledgments
      await page.waitForSelector('[data-testid="acknowledgment"]', { timeout: 20000 });

      // Count acknowledgments
      const acks = await page.$$('[data-testid="acknowledgment"]');
      
      // Should have multiple acknowledgments
      expect(acks.length).toBeGreaterThan(1);
    });
  });

  test.describe('Task Distribution', () => {
    test('should distribute tasks evenly across agents', async ({ page }) => {
      await page.goto('/chat');

      // Request multiple tasks
      await page.fill('[data-testid="chat-input"]', 'Create 6 different components');
      await page.click('[data-testid="send-button"]');

      // Wait for task distribution
      await page.waitForSelector('[data-testid="task-board"]', { timeout: 15000 });

      // Get task assignments
      const taskAssignments = await page.$$('[data-testid="task-assignment"]');
      
      // Verify distribution (should be roughly even)
      const agentTaskCounts = new Map<string, number>();
      
      for (const assignment of taskAssignments) {
        const agentId = await assignment.getAttribute('data-agent-id');
        if (agentId) {
          agentTaskCounts.set(agentId, (agentTaskCounts.get(agentId) || 0) + 1);
        }
      }

      // Check even distribution
      const counts = Array.from(agentTaskCounts.values());
      const maxDiff = Math.max(...counts) - Math.min(...counts);
      
      // Difference should be at most 1
      expect(maxDiff).toBeLessThanOrEqual(1);
    });

    test('should balance load based on agent capacity', async ({ page }) => {
      await page.goto('/chat');

      // Set agent capacities
      await page.evaluate(() => {
        window.localStorage.setItem('agent-capacities', JSON.stringify({
          'agent-1': 5,
          'agent-2': 10,
          'agent-3': 15,
        }));
      });

      await page.reload();

      // Request tasks
      await page.fill('[data-testid="chat-input"]', 'Create 30 tasks');
      await page.click('[data-testid="send-button"]');

      // Wait for load balancing
      await page.waitForSelector('[data-testid="load-status"]', { timeout: 20000 });

      // Verify load distribution matches capacity
      const agentLoads = await page.evaluate(() => {
        return window.localStorage.getItem('agent-current-loads');
      });

      if (agentLoads) {
        const loads = JSON.parse(agentLoads);
        // Agent 3 should have more tasks than Agent 1
        expect(loads['agent-3']).toBeGreaterThan(loads['agent-1']);
      }
    });
  });

  test.describe('Artifact Management', () => {
    test('should track artifacts created by different agents', async ({ page }) => {
      await page.goto('/chat');

      // Request artifact creation
      await page.fill('[data-testid="chat-input"]', 'Create component, tests, and documentation');
      await page.click('[data-testid="send-button"]');

      // Wait for artifacts
      await page.waitForSelector('[data-testid="artifact"]', { timeout: 30000 });

      // Get all artifacts
      const artifacts = await page.$$('[data-testid="artifact"]');
      
      expect(artifacts.length).toBeGreaterThanOrEqual(3);

      // Verify artifact metadata
      for (const artifact of artifacts) {
        const createdBy = await artifact.getAttribute('data-created-by');
        expect(createdBy).toBeDefined();
      }
    });

    test('should handle artifact dependencies', async ({ page }) => {
      await page.goto('/chat');

      // Request dependent artifacts
      await page.fill('[data-testid="chat-input"]', 'Create base component then extend it');
      await page.click('[data-testid="send-button"]');

      // Wait for artifact chain
      await page.waitForSelector('[data-testid="artifact-chain"]', { timeout: 30000 });

      // Verify dependency order
      const artifacts = await page.$$('[data-testid="artifact"]');
      
      // First artifact should be base
      const firstArtifactType = await artifacts[0].getAttribute('data-type');
      expect(firstArtifactType).toContain('base');

      // Last artifact should reference dependencies
      const lastArtifact = artifacts[artifacts.length - 1];
      const dependencies = await lastArtifact.getAttribute('data-dependencies');
      expect(dependencies).toBeDefined();
    });
  });

  test.describe('Error Handling and Recovery', () => {
    test('should handle agent timeout and retry', async ({ page }) => {
      await page.goto('/chat');

      // Simulate timeout scenario
      await page.evaluate(() => {
        window.localStorage.setItem('mock-timeout', 'true');
      });

      await page.reload();

      await page.fill('[data-testid="chat-input"]', 'Create a service');
      await page.click('[data-testid="send-button"]');

      // Wait for retry logic
      await page.waitForSelector('[data-testid="retry-attempt"]', { timeout: 20000 });

      // Verify eventual success
      await page.waitForSelector('[data-testid="task-success"]', { timeout: 30000 });
    });

    test('should handle cascading failures', async ({ page }) => {
      await page.goto('/chat');

      // Trigger cascading failure
      await page.evaluate(() => {
        window.localStorage.setItem('mock-cascade-failure', 'true');
      });

      await page.reload();

      await page.fill('[data-testid="chat-input"]', 'Execute multi-step workflow');
      await page.click('[data-testid="send-button"]');

      // Wait for failure detection
      await page.waitForSelector('[data-testid="failure-detected"]', { timeout: 15000 });

      // Verify recovery initiated
      await page.waitForSelector('[data-testid="recovery-initiated"]', { timeout: 20000 });

      // Verify system recovered
      await page.waitForSelector('[data-testid="system-recovered"]', { timeout: 30000 });
    });
  });

  test.describe('Performance Metrics', () => {
    test('should track execution time per agent', async ({ page }) => {
      await page.goto('/chat');

      // Enable performance tracking
      await page.evaluate(() => {
        window.localStorage.setItem('enable-performance-tracking', 'true');
      });

      await page.reload();

      await page.fill('[data-testid="chat-input"]', 'Execute timed workflow');
      await page.click('[data-testid="send-button"]');

      // Wait for completion
      await page.waitForSelector('[data-testid="workflow-complete"]', { timeout: 60000 });

      // Get performance metrics
      const metrics = await page.evaluate(() => {
        return window.localStorage.getItem('agent-performance-metrics');
      });

      if (metrics) {
        const parsed = JSON.parse(metrics);
        
        // Verify all agents have timing data
        Object.values(parsed).forEach((agent: any) => {
          expect(agent.executionTime).toBeGreaterThan(0);
        });
      }
    });

    test('should track message throughput', async ({ page }) => {
      await page.goto('/chat');

      // Request high-throughput scenario
      await page.fill('[data-testid="chat-input"]', 'Process 100 messages');
      await page.click('[data-testid="send-button"]');

      // Wait for processing
      await page.waitForSelector('[data-testid="throughput-stats"]', { timeout: 60000 });

      // Get throughput stats
      const stats = await page.evaluate(() => {
        return window.localStorage.getItem('message-throughput');
      });

      if (stats) {
        const parsed = JSON.parse(stats);
        
        // Should process all messages
        expect(parsed.processed).toBe(100);
        
        // Should have reasonable throughput (> 10 msg/s)
        expect(parsed.throughput).toBeGreaterThan(10);
      }
    });
  });
});

test.describe('Swarm Orchestration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('should orchestrate complex swarm workflow', async ({ page }) => {
    // Request complex workflow
    await page.fill('[data-testid="chat-input"]', 'Build a complete web application with database');
    await page.click('[data-testid="send-button"]');

    // Wait for swarm initialization
    await page.waitForSelector('[data-testid="swarm-initialized"]', { timeout: 15000 });

    // Monitor swarm progress
    await page.waitForSelector('[data-testid="swarm-progress"]', { timeout: 60000 });

    // Verify swarm completion
    await page.waitForSelector('[data-testid="swarm-complete"]', { timeout: 120000 });

    // Verify all tasks completed
    const completedTasks = await page.$$('[data-testid="swarm-task=completed"]');
    expect(completedTasks.length).toBeGreaterThan(5);
  });

  test('should handle dynamic agent scaling', async ({ page }) => {
    // Request workload that requires scaling
    await page.fill('[data-testid="chat-input"]', 'Process large dataset with multiple operations');
    await page.click('[data-testid="send-button"]');

    // Wait for scaling decision
    await page.waitForSelector('[data-testid="scaling-event"]', { timeout: 30000 });

    // Verify agents were added
    const agentCount = await page.$$('[data-testid="active-agent"]');
    expect(agentCount.length).toBeGreaterThan(2);
  });
});

test.describe('Local LLM Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should discover and use local Ollama provider', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');

    // Go to providers tab
    await page.click('[data-testid="providers-tab"]');

    // Trigger discovery
    await page.click('[data-testid="discover-providers"]');

    // Wait for discovery results
    await page.waitForSelector('[data-testid="discovery-results"]', { timeout: 10000 });

    // Verify Ollama was discovered
    const ollamaProvider = await page.$('[data-testid="provider=Ollama"]');
    expect(ollamaProvider).toBeDefined();

    // Enable Ollama
    await page.click('[data-testid="enable-Ollama"]');

    // Select Ollama model
    await page.goto('/chat');
    await page.selectOption('[data-testid="model-selector"]', 'gemma:7b');

    // Test chat with local model
    await page.fill('[data-testid="chat-input"]', 'Hello from local LLM');
    await page.click('[data-testid="send-button"]');

    // Wait for response
    await page.waitForSelector('[data-testid="assistant-response"]', { timeout: 30000 });
  });

  test('should handle multiple local providers', async ({ page }) => {
    await page.goto('/settings/providers');

    // Discover providers
    await page.click('[data-testid="discover-providers"]');
    await page.waitForSelector('[data-testid="discovery-results"]', { timeout: 10000 });

    // Enable multiple providers
    const providers = ['Ollama', 'LMStudio'];
    
    for (const provider of providers) {
      const element = await page.$(`[data-testid="enable-${provider}"]`);
      if (element) {
        await element.click();
      }
    }

    // Verify multiple providers enabled
    await page.goto('/chat');
    
    const availableModels = await page.$$('[data-testid="model-option"]');
    expect(availableModels.length).toBeGreaterThan(1);
  });
});
