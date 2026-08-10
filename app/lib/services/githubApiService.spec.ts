import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubApiServiceClass } from './githubApiService';
import type { GitHubRepoInfo } from '~/types/GitHub';

/**
 * Helper to build a mock fetch Response.
 */
function mockResponse(body: unknown, init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}) {
  const ok = init.ok ?? (init.status ? init.status >= 200 && init.status < 300 : true);
  const status = init.status ?? 200;
  const headers = new Headers(init.headers);

  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
    headers,
    type: 'basic',
  } as any;
}

describe('GitHubApiServiceClass', () => {
  let service: GitHubApiServiceClass;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;
    service = new GitHubApiServiceClass();
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configure', () => {
    it('should set token and baseURL from config', () => {
      service.configure({ token: 'ghp_test', tokenType: 'classic' });
      expect((service as any)._config.token).toBe('ghp_test');
    });

    it('should merge config with existing config', () => {
      service.configure({ token: 'token1' });
      service.configure({ baseURL: 'https://custom.api.com' });
      expect((service as any)._config.token).toBe('token1');
      expect((service as any)._baseURL).toBe('https://custom.api.com');
    });

    it('should use default API base URL when not specified', () => {
      expect((service as any)._baseURL).toBe('https://api.github.com');
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should throw when no token is configured', async () => {
      await expect(service.getAuthenticatedUser()).rejects.toThrow('GitHub token is required');
    });

    it('should fetch /user endpoint with auth headers', async () => {
      service.configure({ token: 'ghp_test', tokenType: 'classic' });
      const userData = { login: 'testuser', id: 1 };
      mockFetch.mockResolvedValue(mockResponse(userData));

      const result = await service.getAuthenticatedUser();
      expect(result).toEqual(userData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token ghp_test',
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Bolt.diy',
          }),
        }),
      );
    });

    it('should use Bearer prefix for fine-grained tokens', async () => {
      service.configure({ token: 'github_pat_test', tokenType: 'fine-grained' });
      mockFetch.mockResolvedValue(mockResponse({ login: 'user' }));

      await service.getAuthenticatedUser();
      const call = mockFetch.mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer github_pat_test');
    });

    it('should throw a structured error on non-OK response', async () => {
      service.configure({ token: 'bad' });
      mockFetch.mockResolvedValue(
        mockResponse({ message: 'Bad credentials' }, { ok: false, status: 401 }),
      );

      await expect(service.getAuthenticatedUser()).rejects.toMatchObject({
        message: 'Bad credentials',
        status: 401,
      });
    });
  });

  describe('getAllUserRepositories', () => {
    it('should paginate through all repos', async () => {
      service.configure({ token: 'ghp_test' });

      const page1 = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        name: `repo${i}`,
        full_name: `user/repo${i}`,
        html_url: `https://github.com/user/repo${i}`,
        description: 'test repo',
        default_branch: 'main',
        languages_url: `https://api.github.com/repos/user/repo${i}/languages`,
        private: false,
        stargazers_count: 0,
        forks_count: 0,
        size: 100,
        language: 'TypeScript',
        updated_at: '2024-01-01T00:00:00Z',
        archived: false,
        fork: false,
      })) as GitHubRepoInfo[];

      const page2: GitHubRepoInfo[] = [
        {
          id: '100',
          name: 'repo100',
          full_name: 'user/repo100',
          html_url: 'https://github.com/user/repo100',
          description: 'test repo 100',
          default_branch: 'main',
          languages_url: 'https://api.github.com/repos/user/repo100/languages',
          private: true,
          stargazers_count: 5,
          forks_count: 2,
          size: 200,
          language: 'Python',
          updated_at: '2024-02-01T00:00:00Z',
          archived: false,
          fork: false,
        },
      ];

      mockFetch
        .mockResolvedValueOnce(mockResponse(page1))
        .mockResolvedValueOnce(mockResponse(page2));

      const result = await service.getAllUserRepositories();
      expect(result).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should stop paginating when fewer than 100 repos are returned', async () => {
      service.configure({ token: 'ghp_test' });
      const smallPage: GitHubRepoInfo[] = [
        {
          id: '1',
          name: 'single-repo',
          full_name: 'user/single-repo',
          html_url: 'https://github.com/user/single-repo',
          description: 'a single repo',
          default_branch: 'main',
          languages_url: 'https://api.github.com/repos/user/single-repo/languages',
          private: false,
          stargazers_count: 10,
          forks_count: 3,
          size: 500,
          language: 'Rust',
          updated_at: '2024-03-01T00:00:00Z',
          archived: false,
          fork: false,
        },
      ];

      mockFetch.mockResolvedValueOnce(mockResponse(smallPage));
      const result = await service.getAllUserRepositories();
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRepositoryBranches', () => {
    it('should fetch branches for a repo', async () => {
      service.configure({ token: 'ghp_test' });
      const branches = [{ name: 'main', commit: { sha: 'abc' } }];
      mockFetch.mockResolvedValue(mockResponse(branches));

      const result = await service.getRepositoryBranches('owner', 'repo');
      expect(result).toEqual(branches);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/branches',
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  describe('getDetailedRepositoryInfo', () => {
    it('should aggregate repo info with branches and metrics', async () => {
      service.configure({ token: 'ghp_test' });

      const repoInfo: GitHubRepoInfo = {
        id: '1',
        name: 'my-repo',
        full_name: 'owner/my-repo',
        html_url: 'https://github.com/owner/my-repo',
        description: 'my test repo',
        default_branch: 'main',
        languages_url: 'https://api.github.com/repos/owner/my-repo/languages',
        private: false,
        stargazers_count: 42,
        forks_count: 7,
        size: 1000,
        language: 'TypeScript',
        updated_at: '2024-06-01T00:00:00Z',
        archived: false,
        fork: false,
      };

      const branches = [{ name: 'main' }, { name: 'dev' }];

      // _makeRequestInternal for repo info → ok
      // getRepositoryBranches → ok (2 branches)
      // contributor count → Link header with page=5
      // issues count → no Link header, body = [{}]
      // pull requests count → Link header with page=3
      mockFetch
        .mockResolvedValueOnce(mockResponse(repoInfo)) // /repos/owner/repo
        .mockResolvedValueOnce(mockResponse(branches)) // /repos/owner/repo/branches
        .mockResolvedValueOnce(
          mockResponse([], {
            headers: { Link: '<https://api.github.com/repos/owner/my-repo/contributors?page=5>; rel="last"' },
          }),
        ) // contributors
        .mockResolvedValueOnce(mockResponse([{}])) // issues (no Link header)
        .mockResolvedValueOnce(
          mockResponse([], {
            headers: { Link: '<https://api.github.com/repos/owner/my-repo/pulls?page=3>; rel="last"' },
          }),
        ); // pull requests

      const result = await service.getDetailedRepositoryInfo('owner', 'my-repo');

      expect(result.name).toBe('my-repo');
      expect(result.branches_count).toBe(2);
      expect(result.contributors_count).toBe(5);
      expect(result.issues_count).toBe(1);
      expect(result.pull_requests_count).toBe(3);
    });

    it('should handle failed branch fetch gracefully', async () => {
      service.configure({ token: 'ghp_test' });

      const repoInfo: GitHubRepoInfo = {
        id: '1',
        name: 'repo',
        full_name: 'owner/repo',
        html_url: 'https://github.com/owner/repo',
        description: 'test repo',
        default_branch: 'main',
        languages_url: 'https://api.github.com/repos/owner/repo/languages',
        private: false,
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
        language: 'JavaScript',
        updated_at: '2024-01-01T00:00:00Z',
        archived: false,
        fork: false,
      };

      mockFetch
        .mockResolvedValueOnce(mockResponse(repoInfo)) // repo info ok
        .mockResolvedValueOnce(mockResponse({ message: 'Not Found' }, { ok: false, status: 404 })) // branches fail
        .mockResolvedValueOnce(mockResponse([])) // contributors ok, no link
        .mockResolvedValueOnce(mockResponse([])) // issues ok, no link
        .mockResolvedValueOnce(mockResponse([])); // pulls ok, no link

      const result = await service.getDetailedRepositoryInfo('owner', 'repo');
      expect(result.branches_count).toBe(0);
    });
  });

  describe('calculateRepositoryStats (pure)', () => {
    it('should calculate language stats and repository health', () => {
      const repos = [
        {
          id: 1,
          name: 'r1',
          full_name: 'u/r1',
          private: false,
          stargazers_count: 10,
          forks_count: 2,
          size: 1000,
          language: 'TypeScript',
          updated_at: new Date(Date.now() - 3 * 86400000).toISOString(), // 3 days ago
          archived: false,
          fork: false,
          branches_count: 3,
          contributors_count: 5,
          issues_count: 2,
          pull_requests_count: 1,
        },
        {
          id: 2,
          name: 'r2',
          full_name: 'u/r2',
          private: true,
          stargazers_count: 0,
          forks_count: 0,
          size: 500,
          language: 'Python',
          updated_at: new Date('2020-01-01').toISOString(),
          archived: true,
          fork: false,
          branches_count: 1,
          contributors_count: 1,
          issues_count: 0,
          pull_requests_count: 0,
        },
        {
          id: 3,
          name: 'r3',
          full_name: 'u/r3',
          private: false,
          stargazers_count: 3,
          forks_count: 1,
          size: 200,
          language: 'TypeScript',
          updated_at: new Date(Date.now() - 20 * 86400000).toISOString(), // 20 days ago
          archived: false,
          fork: true,
          branches_count: 0,
          contributors_count: 0,
          issues_count: 0,
          pull_requests_count: 0,
        },
      ] as any[];

      const stats = service.calculateRepositoryStats(repos);

      expect(stats.languages).toEqual({ TypeScript: 2, Python: 1 });
      expect(stats.totalBranches).toBe(4);
      expect(stats.totalContributors).toBe(6);
      expect(stats.totalIssues).toBe(2);
      expect(stats.totalPullRequests).toBe(1);
      expect(stats.repositoryHealth.active).toBe(1); // r1 updated 3 days ago
      expect(stats.repositoryHealth.archived).toBe(1);
      expect(stats.repositoryHealth.forked).toBe(1);
    });

    it('should handle empty repo list', () => {
      const stats = service.calculateRepositoryStats([]);
      expect(stats.languages).toEqual({});
      expect(stats.totalBranches).toBe(0);
      expect(stats.mostUsedLanguages).toEqual([]);
      expect(stats.repositoryHealth).toEqual({ healthy: 0, active: 0, archived: 0, forked: 0 });
    });

    it('should sort mostUsedLanguages by bytes descending', () => {
      const repos = [
        {
          id: 1,
          name: 'r1',
          full_name: 'u/r1',
          private: false,
          stargazers_count: 0,
          forks_count: 0,
          size: 100,
          language: 'Go',
          updated_at: '2020-01-01T00:00:00Z',
          archived: false,
          fork: false,
        },
        {
          id: 2,
          name: 'r2',
          full_name: 'u/r2',
          private: false,
          stargazers_count: 0,
          forks_count: 0,
          size: 5000,
          language: 'Rust',
          updated_at: '2020-01-01T00:00:00Z',
          archived: false,
          fork: false,
        },
      ] as any[];

      const stats = service.calculateRepositoryStats(repos);
      expect(stats.mostUsedLanguages[0].language).toBe('Rust');
      expect(stats.mostUsedLanguages[0].bytes).toBe(5000);
      expect(stats.mostUsedLanguages[1].language).toBe('Go');
    });
  });

  describe('clearCache / clearUserCache', () => {
    it('should be no-ops (placeholders)', () => {
      expect(() => service.clearCache()).not.toThrow();
      expect(() => service.clearUserCache('some-token')).not.toThrow();
    });
  });
});