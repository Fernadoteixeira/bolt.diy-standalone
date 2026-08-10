import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectProjectCommands,
  createCommandsMessage,
  escapeBoltArtifactTags,
  escapeBoltAActionTags,
  escapeBoltTags,
  createCommandActionsString,
  type ProjectCommands,
} from './projectCommands';

describe('projectCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectProjectCommands', () => {
    it('should detect a Node.js project with a dev script', async () => {
      const files = [
        {
          path: 'project/package.json',
          content: JSON.stringify({
            scripts: { dev: 'vite', start: 'node server.js' },
            dependencies: {},
          }),
        },
      ];

      const result = await detectProjectCommands(files);

      expect(result.type).toBe('Node.js');
      expect(result.startCommand).toBe('npm run dev');
      expect(result.setupCommand).toContain('npm install');
      expect(result.followupMessage).toContain('dev');
    });

    it('should prefer dev over start and preview scripts', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({
            scripts: { preview: 'vite preview', start: 'node server.js', dev: 'vite' },
          }),
        },
      ];

      const result = await detectProjectCommands(files);
      expect(result.startCommand).toBe('npm run dev');
    });

    it('should fall back to start when dev is missing', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ scripts: { start: 'node server.js' } }),
        },
      ];

      const result = await detectProjectCommands(files);
      expect(result.startCommand).toBe('npm run start');
    });

    it('should fall back to preview when dev and start are missing', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ scripts: { preview: 'vite preview' } }),
        },
      ];

      const result = await detectProjectCommands(files);
      expect(result.startCommand).toBe('npm run preview');
    });

    it('should return a followup message when no known scripts are found', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ scripts: { build: 'tsc' } }),
        },
      ];

      const result = await detectProjectCommands(files);
      expect(result.type).toBe('Node.js');
      expect(result.startCommand).toBeUndefined();
      expect(result.followupMessage).toContain('inspect package.json');
    });

    it('should detect shadcn projects and add shadcn init to setup', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({
            scripts: { dev: 'vite' },
            dependencies: { 'some-shadcn-thing': '1.0.0' },
          }),
        },
        {
          path: 'components.json',
          content: 'shadcn config',
        },
      ];

      const result = await detectProjectCommands(files);
      expect(result.setupCommand).toContain('shadcn@latest init');
    });

    it('should make setup command non-interactive', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ scripts: { dev: 'vite' } }),
        },
      ];

      const result = await detectProjectCommands(files);
      expect(result.setupCommand).toContain('CI=true');
      expect(result.setupCommand).toContain('DEBIAN_FRONTEND=noninteractive');
    });

    it('should detect a static project with index.html', async () => {
      const files = [{ path: 'index.html', content: '<html></html>' }];

      const result = await detectProjectCommands(files);
      expect(result.type).toBe('Static');
      expect(result.startCommand).toBe('npx --yes serve');
    });

    it('should return empty commands when no recognizable project is found', async () => {
      const files = [{ path: 'README.md', content: '# Hello' }];

      const result = await detectProjectCommands(files);
      expect(result.type).toBe('');
      expect(result.setupCommand).toBe('');
      expect(result.startCommand).toBeUndefined();
    });

    it('should handle invalid package.json gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
      const files = [{ path: 'package.json', content: '{invalid json' }];

      const result = await detectProjectCommands(files);
      expect(result.type).toBe('');
      expect(result.setupCommand).toBe('');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle package.json without scripts', async () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({ dependencies: {} }),
        },
      ];

      const result = await detectProjectCommands(files);
      expect(result.type).toBe('Node.js');
      expect(result.startCommand).toBeUndefined();
    });
  });

  describe('createCommandsMessage', () => {
    it('should return null when neither setupCommand nor startCommand is present', () => {
      const result = createCommandsMessage({ type: '', followupMessage: '' });
      expect(result).toBeNull();
    });

    it('should create a message with both setup and start commands', () => {
      const commands: ProjectCommands = {
        type: 'Node.js',
        setupCommand: 'npm install',
        startCommand: 'npm run dev',
        followupMessage: 'Starting dev server',
      };

      const result = createCommandsMessage(commands);
      expect(result).not.toBeNull();
      expect(result!.role).toBe('assistant');
      expect(result!.content).toContain('npm install');
      expect(result!.content).toContain('npm run dev');
      expect(result!.content).toContain('Starting dev server');
      expect(result!.content).toContain('<boltArtifact');
      expect(result!.content).toContain('type="shell"');
      expect(result!.content).toContain('type="start"');
    });

    it('should create a message with only a setup command', () => {
      const commands: ProjectCommands = {
        type: 'Node.js',
        setupCommand: 'npm install',
        followupMessage: '',
      };

      const result = createCommandsMessage(commands);
      expect(result).not.toBeNull();
      expect(result!.content).toContain('type="shell"');
      expect(result!.content).not.toContain('type="start"');
    });

    it('should create a message with only a start command', () => {
      const commands: ProjectCommands = {
        type: 'Static',
        startCommand: 'npx serve',
        followupMessage: '',
      };

      const result = createCommandsMessage(commands);
      expect(result).not.toBeNull();
      expect(result!.content).toContain('type="start"');
      expect(result!.content).not.toContain('type="shell"');
    });

    it('should generate a unique id for each message', () => {
      const commands: ProjectCommands = {
        type: 'Node.js',
        setupCommand: 'npm install',
        startCommand: 'npm run dev',
        followupMessage: '',
      };

      const msg1 = createCommandsMessage(commands);
      const msg2 = createCommandsMessage(commands);
      expect(msg1!.id).not.toBe(msg2!.id);
    });
  });

  describe('escapeBoltArtifactTags', () => {
    it('should escape boltArtifact tags while preserving content', () => {
      const input = '<boltArtifact id="test" title="Test">content here</boltArtifact>';
      const result = escapeBoltArtifactTags(input);
      expect(result).toContain('&lt;boltArtifact');
      expect(result).toContain('&lt;/boltArtifact&gt;');
      expect(result).toContain('content here');
    });

    it('should handle multiple boltArtifact tags', () => {
      const input = '<boltArtifact id="a">A</boltArtifact>\n<boltArtifact id="b">B</boltArtifact>';
      const result = escapeBoltArtifactTags(input);
      expect(result).toMatch(/&lt;boltArtifact/g);
      expect(result).not.toMatch(/<boltArtifact/g);
    });

    it('should leave non-boltArtifact content unchanged', () => {
      const input = 'Just some text <div>hello</div>';
      const result = escapeBoltArtifactTags(input);
      expect(result).toBe(input);
    });
  });

  describe('escapeBoltAActionTags', () => {
    it('should escape boltAction tags while preserving content', () => {
      const input = '<boltAction type="file" filePath="src.ts">code</boltAction>';
      const result = escapeBoltAActionTags(input);
      expect(result).toContain('&lt;boltAction');
      expect(result).toContain('&lt;/boltAction&gt;');
      expect(result).toContain('code');
    });

    it('should handle multiple boltAction tags', () => {
      const input = '<boltAction type="shell">cmd</boltAction>\n<boltAction type="start">run</boltAction>';
      const result = escapeBoltAActionTags(input);
      expect(result).toMatch(/&lt;boltAction/g);
      expect(result).not.toMatch(/<boltAction/g);
    });
  });

  describe('escapeBoltTags', () => {
    it('should escape both boltArtifact and boltAction tags', () => {
      const input = '<boltArtifact id="a"><boltAction type="file">code</boltAction></boltArtifact>';
      const result = escapeBoltTags(input);
      expect(result).not.toMatch(/<boltArtifact/g);
      expect(result).not.toMatch(/<boltAction/g);
      expect(result).toContain('code');
    });

    it('should escape nested tags correctly', () => {
      const input = `
<boltArtifact id="test" title="Test">
  <boltAction type="shell">npm install</boltAction>
  <boltAction type="start">npm run dev</boltAction>
</boltArtifact>`;
      const result = escapeBoltTags(input);
      expect(result).not.toMatch(/<boltArtifact/);
      expect(result).not.toMatch(/<boltAction/);
      expect(result).toContain('npm install');
      expect(result).toContain('npm run dev');
    });
  });

  describe('createCommandActionsString', () => {
    it('should return empty string when no commands', () => {
      const result = createCommandActionsString({ type: '', followupMessage: '' });
      expect(result).toBe('');
    });

    it('should generate action string for setup and start commands', () => {
      const commands: ProjectCommands = {
        type: 'Node.js',
        setupCommand: 'npm install',
        startCommand: 'npm run dev',
        followupMessage: '',
      };

      const result = createCommandActionsString(commands);
      expect(result).toContain('type="shell"');
      expect(result).toContain('npm install');
      expect(result).toContain('type="start"');
      expect(result).toContain('npm run dev');
    });

    it('should generate action string for only setup command', () => {
      const commands: ProjectCommands = {
        type: 'Node.js',
        setupCommand: 'npm install',
        followupMessage: '',
      };

      const result = createCommandActionsString(commands);
      expect(result).toContain('type="shell"');
      expect(result).not.toContain('type="start"');
    });

    it('should generate action string for only start command', () => {
      const commands: ProjectCommands = {
        type: 'Static',
        startCommand: 'npx serve',
        followupMessage: '',
      };

      const result = createCommandActionsString(commands);
      expect(result).toContain('type="start"');
      expect(result).not.toContain('type="shell"');
    });
  });
});