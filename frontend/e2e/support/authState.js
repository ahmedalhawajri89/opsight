import path from 'node:path';

/**
 * Where the saved sessions live.
 *
 * A plain helper, not a spec: Playwright refuses to let one test file import
 * another, so the path builder lives here and both the setup project and the
 * specs import it.
 *
 * These files contain real session cookies and are git-ignored.
 */
export const STATE_DIR = path.join(process.cwd(), 'playwright', '.auth');

export const authFile = (role) => path.join(STATE_DIR, `${role}.json`);

export const ACCOUNTS = [
  ['owner', 'owner@opsight.test'],
  ['manager', 'manager@opsight.test'],
  ['staff', 'staff@opsight.test'],
  // The owner of the second business on the installation (ADR-023).
  ['otherOwner', 'owner@alnoor.test'],
];
