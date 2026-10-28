export const REPOS: readonly string[] = ["MatiasValdes/rutopia_backend"];

export const CHECK_NAME = "rutopia-arch-review";

export const BOT_NAME = "rutopia-arch-review";

export function watches(fullName: string): boolean {
  return REPOS.some((repo) => repo.toLowerCase() === fullName.toLowerCase());
}

export function reviewMarker(sha: string): string {
  return `<!-- rutopia-arch-review commit:${sha} -->`;
}

export function dedupeKey(owner: string, repo: string, number: number, sha: string): string {
  return `arch-review:${owner}/${repo}#${number}:${sha}`;
}
