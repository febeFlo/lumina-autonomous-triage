import type { RepoNode } from "@/app/types/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const GITHUB_API = "https://api.github.com";

/** File extensions treated as source code nodes */
const SOURCE_EXTENSIONS = [".py", ".ts", ".js", ".go", ".java"] as const;

/** Maximum number of source nodes extracted from a repository tree */
const MAX_NODES = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Internal GitHub API types
// ─────────────────────────────────────────────────────────────────────────────
interface GitHubRepoMeta {
  default_branch: string;
  full_name: string;
}

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsed representation of a GitHub URL
// ─────────────────────────────────────────────────────────────────────────────
export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseGitHubUrl
//
// Accepts any of these URL forms:
//   https://github.com/owner/repo
//   https://github.com/owner/repo.git
//   github.com/owner/repo
//   owner/repo
//
// Returns null when the input cannot be resolved to a valid owner/repo pair.
// ─────────────────────────────────────────────────────────────────────────────
export function parseGitHubUrl(raw: string): ParsedGitHubUrl | null {
  const trimmed = raw.trim().replace(/\.git$/, "");

  // Strip protocol and host when present
  const withoutProtocol = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "");

  // Expect exactly "owner/repo" after stripping
  const parts = withoutProtocol.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo] = parts;
  if (!owner || !repo) return null;

  return { owner, repo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the basename (last path segment) from a relative file path */
function basename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

/** Return true when a filename ends with one of the supported source extensions */
function isSourceFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Distribute nodes evenly on a canvas using a simple grid / radial layout so
 * the caller doesn't have to compute positions manually.  Coordinates are
 * normalised to the [0, 1] range; the renderer scales them to pixel space.
 */
function assignLayout(count: number): Array<{ x: number; y: number }> {
  if (count === 0) return [];

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const positions: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Pad edges so nodes don't sit flush against the canvas border
    const x = cols > 1 ? 0.1 + (col / (cols - 1)) * 0.8 : 0.5;
    const y = rows > 1 ? 0.1 + (row / (rows - 1)) * 0.8 : 0.5;
    positions.push({ x, y });
  }

  return positions;
}

/** Convert a GitHubTreeItem array into RepoNode objects */
function treeItemsToNodes(items: GitHubTreeItem[]): RepoNode[] {
  const sourceFiles = items
    .filter((item) => item.type === "blob" && isSourceFile(item.path))
    .slice(0, MAX_NODES);

  const layout = assignLayout(sourceFiles.length);

  return sourceFiles.map((item, idx) => ({
    id: item.path,
    label: basename(item.path),
    path: item.path,
    status: "HEALTHY",
    x: layout[idx].x,
    y: layout[idx].y,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchRepositoryTree
//
// Full workflow:
//   1. Parse the raw URL into owner + repo.
//   2. Fetch repository metadata to read the real default_branch.
//   3. Fetch the full recursive tree for that branch.
//   4. Filter to source files, cap at MAX_NODES, assign layout positions.
//   5. Return RepoNode[].
//
// Throws a descriptive Error on any failure so the UI can surface it.
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchRepositoryTree(rawUrl: string): Promise<RepoNode[]> {
  // ── Step 1: Parse URL ───────────────────────────────────────────────────
  const parsed = parseGitHubUrl(rawUrl);
  if (!parsed) {
    throw new Error(
      `Invalid GitHub URL: "${rawUrl}". Expected format: https://github.com/owner/repo`
    );
  }

  const { owner, repo } = parsed;

  // ── Step 2: Fetch repo metadata to obtain default_branch ───────────────
  const metaRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
    // Next.js: skip per-request caching so we always get fresh data
    cache: "no-store",
  });

  if (!metaRes.ok) {
    const msg =
      metaRes.status === 404
        ? `Repository "${owner}/${repo}" not found. Check the URL or make sure the repo is public.`
        : `GitHub API error ${metaRes.status} while fetching repo metadata for "${owner}/${repo}".`;
    throw new Error(msg);
  }

  const meta: GitHubRepoMeta = await metaRes.json();
  const branch = meta.default_branch;

  // ── Step 3: Fetch recursive tree ────────────────────────────────────────
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    }
  );

  if (!treeRes.ok) {
    throw new Error(
      `GitHub API error ${treeRes.status} while fetching tree for "${owner}/${repo}" (branch: ${branch}).`
    );
  }

  const treeData: GitHubTreeResponse = await treeRes.json();

  // ── Step 4 & 5: Convert to RepoNode[] ──────────────────────────────────
  const nodes = treeItemsToNodes(treeData.tree);

  if (nodes.length === 0) {
    throw new Error(
      `No supported source files (.py, .ts, .js, .go, .java) found in "${owner}/${repo}".`
    );
  }

  return nodes;
}
