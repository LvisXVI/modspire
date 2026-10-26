import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeProject, validateProject } from './schema.js';

const idPattern = /^[0-9a-f-]{36}$/i;
const projectFile = (root, id) => {
  if (!idPattern.test(id)) throw new Error('Ungültige Projekt-ID.');
  return join(root, id, 'project.json');
};

export function createProjectStore(root) {
  async function ensureRoot() { await mkdir(root, { recursive: true }); }

  async function list() {
    await ensureRoot();
    const entries = await readdir(root, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !idPattern.test(entry.name)) continue;
      try {
        const project = await read(entry.name);
        projects.push({ id: project.id, name: project.name, namespace: project.namespace, updatedAt: project.updatedAt, target: project.target, elementCount: project.elements.length, timeSpentMs: project.timeSpentMs });
      } catch { /* Ignore incomplete atomic writes and malformed project files. */ }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function create(input) {
    await ensureRoot();
    const project = makeProject(input);
    const directory = join(root, project.id);
    await mkdir(directory, { recursive: false });
    await writeFile(join(directory, 'project.json'), `${JSON.stringify(project, null, 2)}\n`, { flag: 'wx' });
    return project;
  }

  async function read(id) {
    const raw = await readFile(projectFile(root, id), 'utf8');
    const project = validateProject(JSON.parse(raw));
    if (project.id !== id) throw new Error('Projektkennung stimmt nicht mit dem Speicherort überein.');
    return project;
  }

  async function write(id, value) {
    await ensureRoot();
    if (!idPattern.test(id) || value?.id !== id) throw new Error('Projektkennung stimmt nicht überein.');
    const project = validateProject({ ...value, updatedAt: new Date().toISOString() });
    const destination = projectFile(root, id);
    const temp = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(project, null, 2)}\n`, { flag: 'wx' });
      await rename(temp, destination);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
    return project;
  }

  return { list, create, read, write, root };
}
