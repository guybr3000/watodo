import { Octokit } from '@octokit/rest';
import axios from 'axios';
import { config } from '../config.js';

export interface GitHubRepoMetadata {
  owner: string;
  repo: string;
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  primaryLanguage: string;
  topics: string[];
  license?: string;
  readme: string;
  htmlUrl: string;
  pushedAt: string;
}

export async function fetchGitHubRepoMetadata(owner: string, repo: string): Promise<GitHubRepoMetadata> {
  const octokit = new Octokit({ auth: config.githubToken || undefined });

  try {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

    let readme = '';
    try {
      const { data: readmeData } = await octokit.rest.repos.getReadme({
        owner,
        repo,
        mediaType: { format: 'raw' }
      });
      readme = typeof readmeData === 'string' ? readmeData : String(readmeData);
      // Truncate README if excessively long
      if (readme.length > 8000) {
        readme = readme.substring(0, 8000) + '\n\n... (README truncated for context processing)';
      }
    } catch {
      readme = 'No README found or inaccessible.';
    }

    return {
      owner,
      repo,
      fullName: repoData.full_name,
      description: repoData.description || 'No description provided.',
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count,
      primaryLanguage: repoData.language || 'Unknown',
      topics: repoData.topics || [],
      license: repoData.license?.spdx_id || repoData.license?.name,
      readme,
      htmlUrl: repoData.html_url,
      pushedAt: repoData.pushed_at || new Date().toISOString()
    };
  } catch (error: any) {
    // Fallback if API fails or unauthenticated rate limit
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      description: `GitHub repository ${owner}/${repo}`,
      stars: 0,
      forks: 0,
      openIssues: 0,
      primaryLanguage: 'Unknown',
      topics: [],
      readme: `Could not fetch GitHub metadata: ${error.message}`,
      htmlUrl: `https://github.com/${owner}/${repo}`,
      pushedAt: new Date().toISOString()
    };
  }
}
