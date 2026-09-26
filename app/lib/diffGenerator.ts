import type { DiffResult } from "@/app/types/types";

// ─────────────────────────────────────────────────────────────────────────────
// Patch recipe – one recipe per canonical error type
// ─────────────────────────────────────────────────────────────────────────────

interface PatchRecipe {
  /** Short human-readable description of the fix */
  summary: string;
  /**
   * Array of { removal, addition } line pairs that make up the hunk body.
   * Each pair represents one changed logical line.
   */
  hunks: Array<{ removal: string; addition: string }>;
}

const PATCH_RECIPES: Record<string, PatchRecipe> = {
  KeyError: {
    summary: "Replace direct dict key access with .get() to guard missing keys",
    hunks: [
      {
        removal: "    return db[key]",
        addition: "    return db.get(key, None)",
      },
    ],
  },

  AttributeError: {
    summary:
      "Add optional-chaining guards to prevent access on None / undefined",
    hunks: [
      {
        removal: "    return user.profile.name",
        addition: "    return user?.profile?.name ?? 'Anonymous'",
      },
    ],
  },

  NullPointer: {
    summary:
      "Add optional-chaining guards to prevent null dereference",
    hunks: [
      {
        removal: "    user.profile.name",
        addition: "    user?.profile?.name ?? 'Anonymous'",
      },
    ],
  },

  TypeError: {
    summary: "Add bounds check before index access to prevent type errors",
    hunks: [
      {
        removal: "    return items[index]",
        addition: "    return index < items.length ? items[index] : null",
      },
    ],
  },

  IndexOutOfBounds: {
    summary: "Guard array access with explicit bounds check",
    hunks: [
      {
        removal: "    return items[index]",
        addition: "    return index < items.length ? items[index] : null",
      },
    ],
  },
};

/** Fallback recipe used when no canonical mapping exists */
const FALLBACK_RECIPE: PatchRecipe = {
  summary: "Apply defensive null / bounds guard",
  hunks: [
    {
      removal: "    // unsafe operation",
      addition: "    // safe operation with guard",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Diff string builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a unified-diff string from a recipe and the fault location.
 *
 * Format produced:
 *
 *   --- a/database.py
 *   +++ b/database.py
 *   @@ -52,3 +52,3 @@
 *   -    return db[key]
 *   +    return db.get(key, None)
 */
function buildDiffString(
  filePath: string,
  lineNumber: number,
  recipe: PatchRecipe
): string {
  const lines: string[] = [];

  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);

  // One hunk per recipe entry; place them consecutively around lineNumber
  let currentLine = lineNumber;
  for (const hunk of recipe.hunks) {
    lines.push(`@@ -${currentLine},1 +${currentLine},1 @@`);
    lines.push(`-${hunk.removal}`);
    lines.push(`+${hunk.addition}`);
    currentLine += 1;
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API – generateDiff
//
// @param filePath    Relative path to the file where the fault was detected
// @param errorType   Canonical error type string from the stack-trace parser
//                    (e.g. "KeyError", "NullPointer", "TypeError")
// @param lineNumber  Line number inside filePath where the fault originated
//
// @returns DiffResult ready to be consumed by the Git Diff Inspector component
// ─────────────────────────────────────────────────────────────────────────────
export function generateDiff(
  filePath: string,
  errorType: string,
  lineNumber: number
): DiffResult {
  const recipe = PATCH_RECIPES[errorType] ?? FALLBACK_RECIPE;
  const diff = buildDiffString(filePath, lineNumber, recipe);

  return {
    filePath,
    errorType,
    lineNumber,
    diff,
    summary: recipe.summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export the recipe map so components can enumerate supported error types
// (e.g. for rendering preset log buttons with known error classifications)
// ─────────────────────────────────────────────────────────────────────────────
export const SUPPORTED_ERROR_TYPES = Object.keys(PATCH_RECIPES) as Array<
  keyof typeof PATCH_RECIPES
>;
