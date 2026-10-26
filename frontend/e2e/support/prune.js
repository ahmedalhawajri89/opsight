import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Removing what a spec created, after it has run.
 *
 * Two specs make something real and permanent — a business signs itself up,
 * an owner creates a member of staff — because mocking either would test
 * nothing. Nothing removed them, so they piled up: twenty-five runs left
 * twenty-four stray accounts in the first business, and since the users
 * screen pages at twenty-five rows, two seeded accounts fell off the first
 * page and three unrelated specs went red.
 *
 * It goes through a console command rather than the API because the product
 * has no delete for either, by design (accounts are deactivated by an owner,
 * never deleted). Opening a destructive endpoint so the test suite could keep
 * itself tidy would be the tail wagging the dog; a command that refuses to
 * run on a production installation is the smaller thing to own.
 *
 * Exact names, never patterns: the command is handed the one business name or
 * the one address this run generated.
 */
const BACKEND = path.resolve(process.cwd(), '..', 'backend');

function prune(option, value) {
  try {
    execFileSync('php', ['artisan', 'opsight:e2e:prune', `--${option}=${value}`], {
      cwd: BACKEND,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (error) {
    /*
     * Loud, not swallowed. A cleanup that fails quietly is how the database
     * filled up in the first place, and the suite that notices is this one.
     */
    const detail = [error.stdout, error.stderr].filter(Boolean).join('').trim();

    throw new Error(`Could not prune ${option} "${value}": ${detail || error.message}`);
  }
}

/** Deletes a business a spec signed up, with everything that belongs to it. */
export const pruneBusiness = (name) => prune('business', name);

/** Deletes an account a spec created, and the audit rows naming it. */
export const pruneAccount = (email) => prune('user', email);
