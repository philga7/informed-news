import { readFile } from 'node:fs/promises';

export function parseLocalSkills(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return [];
  }

  const headingMatch = markdown.match(/^##\s+Repo-local skills\s*$/m);
  if (!headingMatch) {
    return [];
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const sectionText = markdown.slice(sectionStart);
  const nextHeadingMatch = sectionText.match(/\n##\s+/);
  const sectionBody = nextHeadingMatch ? sectionText.slice(0, nextHeadingMatch.index) : sectionText;

  const skills = [];
  const seen = new Set();

  for (const line of sectionBody.split('\n')) {
    const skillMatch = line.match(/^\s*[-*]\s+`([^`]+)`/);
    if (!skillMatch) {
      continue;
    }

    const name = skillMatch[1].trim();
    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    skills.push(name);
  }

  return skills;
}

export async function readLocalSkillsFromFile(filePath) {
  const markdown = await readFile(filePath, 'utf8');
  return parseLocalSkills(markdown);
}
