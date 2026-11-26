import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateModels, validateReasoningEfforts } from './workflow.mjs';

try {
  const [configPath, agentsPath, outputPath] = process.argv.slice(2);
  if (!configPath || !agentsPath || !outputPath || process.argv.length !== 5) {
    throw new Error('Usage: install-agent-models.mjs CONFIG AGENTS STAGING_OUTPUT');
  }
  const config = JSON.parse(readFileSync(configPath,'utf8'));
  if (config === null || typeof config !== 'object' || Array.isArray(config)) throw new Error('config must be an object');
  validateModels(config.models);
  validateReasoningEfforts(config.reasoningEfforts);
  mkdirSync(outputPath,{recursive:true});
  for (const name of readdirSync(agentsPath)) {
    if (!/^sdlc-[a-z-]+\.agent\.md$/.test(name)) continue;
    const role = name.slice('sdlc-'.length,-'.agent.md'.length);
    const model = config.models?.[role] ?? config.models?.default;
    const effort = config.reasoningEfforts?.[role] ?? config.reasoningEfforts?.default;
    if (model === undefined && effort === undefined) continue;
    const body = readFileSync(join(agentsPath,name),'utf8');
    const frontmatter = body.match(/^---(\r?\n)([\s\S]*?)\r?\n---(?=\r?\n|$)/);
    if (!frontmatter) throw new Error(`${name}: frontmatter required`);
    const newline = frontmatter[1];
    const fields = frontmatter[2].replace(/^(?:model|reasoning-effort):[^\r\n]*(?:\r?\n|$)/gm,'');
    const bound = [model === undefined ? '' : `model: ${JSON.stringify(model)}${newline}`,
      effort === undefined ? '' : `reasoning-effort: ${JSON.stringify(effort)}${newline}`].join('');
    writeFileSync(join(outputPath,name),`---${newline}${bound}${fields}${newline}---` + body.slice(frontmatter[0].length));
  }
} catch (error) {
  console.error(`Agent model configuration failed: ${error.message}`);
  process.exitCode = 1;
}
