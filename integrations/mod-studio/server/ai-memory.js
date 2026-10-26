import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_RULES = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAiMemory(filePath) {
  async function read() {
    try {
      const value = JSON.parse(await readFile(filePath, 'utf8'));
      return Array.isArray(value.rules) ? value.rules.filter(validRule).slice(-MAX_RULES) : [];
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function write(rules) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, rules }), 'utf8');
    await rename(temporary, filePath);
  }
  return {
    async list(projectId) {
      const rules = await read();
      return rules.filter((rule) => rule.scope === 'global' || rule.scope === projectId);
    },
    async add(text, projectId = null) {
      const value = clean(text);
      if (!value) throw new Error('Schreibe zuerst eine kurze Regel.');
      if (projectId && !UUID.test(projectId)) throw new Error('Ungültige Projekt-ID für die Regel.');
      const rules = await read();
      const scope = projectId || 'global';
      if (rules.some((rule) => rule.scope === scope && rule.text.toLocaleLowerCase('de') === value.toLocaleLowerCase('de'))) {
        return rules.filter((rule) => rule.scope === 'global' || rule.scope === projectId);
      }
      rules.push({ id: randomUUID(), scope, text: value, createdAt: new Date().toISOString() });
      await write(rules.slice(-MAX_RULES));
      return rules.filter((rule) => rule.scope === 'global' || rule.scope === projectId);
    },
    async learnFromMessage(text, projectId = null) {
      const rule = extractRule(text);
      if (!rule) return null;
      const rules = await read();
      const scope = projectId || 'global';
      if (rules.some((entry) => entry.scope === scope && entry.text.toLocaleLowerCase('de') === rule.toLocaleLowerCase('de'))) return null;
      return { rule, rules: await this.add(rule, projectId) };
    },
    async learnFromProposals(proposals, projectId) {
      if (!UUID.test(projectId || '') || !Array.isArray(proposals)) return [];
      const learned = [];
      for (const proposal of proposals.slice(0, 2)) {
        const text = validateLearnedRule(proposal?.text);
        if (!text || !['global', 'project'].includes(proposal?.scope)) continue;
        const scopeId = proposal.scope === 'project' ? projectId : null;
        const rules = await read();
        const scope = scopeId || 'global';
        if (rules.some((rule) => rule.scope === scope && rule.text.toLocaleLowerCase('de') === text.toLocaleLowerCase('de'))) continue;
        await this.add(text, scopeId);
        learned.push({ text, scope: proposal.scope });
      }
      return learned;
    },
    async remove(id, projectId = null) {
      const rules = await read();
      const next = rules.filter((rule) => !(rule.id === id && (rule.scope === 'global' || rule.scope === projectId)));
      if (next.length !== rules.length) await write(next);
      return next.filter((rule) => rule.scope === 'global' || rule.scope === projectId);
    },
  };
}

export function extractRule(input) {
  const text = clean(input);
  if (!text || text.length < 8) return null;
  const match = text.match(/^(?:bitte\s+)?(?:merk(?:e)?\s+dir(?:\s+bitte)?|ab jetzt|künftig|in zukunft|ich bevorzuge|bitte immer|immer)\s*[:,—-]?\s*(.{8,450})$/iu);
  if (!match) return null;
  const rule = match[1].trim().replace(/[.!?]+$/, '');
  return validateLearnedRule(rule);
}

export function validateLearnedRule(input) {
  const value = clean(input).replace(/[.!?]+$/, '').trim();
  if (value.length < 8 || value.length > 500) return null;
  // Memory is for durable working preferences, never credentials or identifying contact details.
  if (/@|\b(?:password|passwort|kennwort|api[-_ ]?key|token|secret|geheimnis|zugangsdaten)\b/iu.test(value)) return null;
  if (/\b(?:sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,})\b/iu.test(value)) return null;
  if (/(?:\+?\d[\d\s()./-]{7,}\d)/u.test(value)) return null;
  if (/\b(?:adresse|wohnort|geburtsdatum|telefonnummer|handynummer|kontonummer|krankheit|diagnose|religion|politische meinung)\b/iu.test(value)) return null;
  return value;
}

function clean(text) {
  return typeof text === 'string' ? text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : '';
}

function validRule(rule) {
  return rule && typeof rule.id === 'string' && (rule.scope === 'global' || UUID.test(rule.scope)) && typeof rule.text === 'string' && rule.text.length > 0;
}
