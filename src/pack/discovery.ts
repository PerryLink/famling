import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function listDlcParents(dlcRoot: string): Promise<string[]> {
  if (!(await isDir(dlcRoot))) return []
  const entries = await readdir(dlcRoot, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => join(dlcRoot, e.name))
}

async function listWorkshopLike(root: string): Promise<string[]> {
  // steamapps/common/<game>/dlc/<pack>
  const common = join(root, 'steamapps', 'common')
  if (!(await isDir(common))) return []
  const games = await readdir(common, { withFileTypes: true })
  const out: string[] = []
  for (const game of games) {
    if (!game.isDirectory()) continue
    out.push(...(await listDlcParents(join(common, game.name, 'dlc'))))
  }
  return out
}

/**
 * Discover pack directories in the layouts we care about:
 * - `<root>/dlc/<pack>/`
 * - `<root>/packs/<pack>/` (dev checkout)
 * - `<root>/steamapps/common/<game>/dlc/<pack>/`
 *
 * The loader still verifies every manifest/signature/hash; discovery only
 * answers "where are the candidates".
 */
export async function discoverPackDirs(root: string): Promise<string[]> {
  const candidates = new Set<string>()
  for (const dir of await listDlcParents(join(root, 'dlc'))) candidates.add(dir)
  for (const dir of await listDlcParents(join(root, 'packs'))) candidates.add(dir)
  for (const dir of await listWorkshopLike(root)) candidates.add(dir)

  const packs: string[] = []
  for (const dir of candidates) {
    try {
      await stat(join(dir, 'manifest.json'))
      packs.push(dir)
    } catch {
      // Not a pack directory.
    }
  }
  return packs.sort()
}
