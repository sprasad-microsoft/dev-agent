import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { assert, contained, workspaceRoot, writeNew } from './io.mjs';
import { object, text, timestamp, validateRepository } from './contracts.mjs';

export function retrieveHistory({ workspace, repository, limit = 30, output, execute = execFileSync }) {
  const root = workspaceRoot(workspace);
  validateRepository(repository);
  assert(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'History limit must be an integer from 1 to 100');
  const filename = contained(root, output);
  assert(!fs.existsSync(filename), `Refusing overwrite: ${output}`);
  const records = [];
  const pageSize = Math.min(limit, 30);
  for (let page = 1; records.length < limit && page <= Math.ceil(limit / pageSize); page++) {
    let comments;
    try {
      comments = JSON.parse(execute('gh', ['api', '--method', 'GET', `repos/${repository}/pulls/comments?per_page=${pageSize}&page=${page}&sort=created&direction=desc`], {
        encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
      }));
    } catch (error) { throw new Error(`GitHub history retrieval failed: ${error.message}`); }
    assert(Array.isArray(comments) && comments.length <= pageSize, 'Invalid GitHub history response');
    for (const comment of comments.slice(0, limit - records.length)) {
      object(comment, 'comment'); text(comment.path, 'comment.path'); text(comment.body, 'comment.body', false); timestamp(comment.created_at, 'comment.created_at');
      assert(typeof comment.html_url === 'string' && comment.html_url.startsWith(`https://github.com/${repository}/pull/`), 'Comment URL outside requested repository');
      assert(typeof comment.pull_request_url === 'string' && new RegExp(`^https://api[.]github[.]com/repos/${repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pulls/[0-9]+$`).test(comment.pull_request_url), 'Pull request URL outside requested repository');
      const line = comment.line ?? comment.original_line ?? null;
      assert(line === null || (Number.isInteger(line) && line > 0), 'Invalid comment line');
      records.push({
        sourceUrl: comment.html_url, path: comment.path, line, body: comment.body, createdAt: comment.created_at,
        pullRequestUrl: `https://github.com/${repository}/pull/${comment.pull_request_url.split('/').at(-1)}`,
        classification: 'untriaged',
      });
    }
    if (comments.length < pageSize) break;
  }
  writeNew(root, output, { schemaVersion: 1, repository, records });
  return { repository, count: records.length, output };
}
