// Sample size and duration for a two-sided test of two proportions (alpha 0.05, power 0.8).
// Shared by the cockpit (src/admin/tabs/Experiments.jsx) and admin-experiment-ai, so the AI never guesses these.

const Z_ALPHA = 1.959964 // two-sided 95%
const Z_BETA = 0.841621 // 80% power

/** People needed in each version to detect a relative lift `mde` on a baseline rate `p` (0.05 = 5%). */
export function perArm(p, mde) {
  if (!(p > 0 && p < 1) || !(mde > 0)) return null
  const p2 = Math.min(0.999, p * (1 + mde))
  const pbar = (p + p2) / 2
  const n = (Z_ALPHA * Math.sqrt(2 * pbar * (1 - pbar)) + Z_BETA * Math.sqrt(p * (1 - p) + p2 * (1 - p2))) ** 2 / (p2 - p) ** 2
  return Math.ceil(n)
}

/** { perArm, total, days } given variants count, daily people reaching the surface and the share in the test */
export function plan({ baseline, mde, arms = 2, daily, share = 1 }) {
  const n = perArm(baseline, mde)
  if (!n) return { perArm: null, total: null, days: null }
  const total = n * arms
  const days = daily > 0 ? Math.ceil(total / (daily * share)) : null
  return { perArm: n, total, days }
}
