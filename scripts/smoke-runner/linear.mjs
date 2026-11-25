// The Linear calls the runner makes, with the owner's personal API key.
//
// Spec: docs/specs/2026-11-24-smoke-test-runner.md (§ The runner, § Submit).

import { request } from 'node:https';

const API = 'https://api.linear.app/graphql';

/**
 * @typedef {{ id: string, name: string, type: string }} State
 * @typedef {object} Issue
 * @property {string} id
 * @property {string} identifier
 * @property {string} title
 * @property {string} url
 * @property {State} state
 * @property {{ id: string, states: State[] }} team
 * @property {string | null} projectId
 * @property {{ body: string, createdAt: string }[]} comments
 */

/**
 * A Linear client over a fetch.
 * @param {string} key a personal API key
 * @param {typeof fetch} fetchImpl
 */
export function linearClient(key, fetchImpl) {
  async function call(query, variables) {
    const res = await fetchImpl(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: key },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.errors) {
      const why = json?.errors?.map((e) => e.message).join('; ') ?? `HTTP ${res.status}`;
      throw new Error(`Linear: ${why}`);
    }
    return json.data;
  }

  return {
    /**
     * @param {string} identifier `GCS-<n>`
     * @returns {Promise<Issue | null>}
     */
    async issue(identifier) {
      const data = await call(
        `query($id: String!) { issue(id: $id) {
          id identifier title url
          state { id name type }
          team { id states { nodes { id name type } } }
          project { id }
          comments(first: 250) { nodes { body createdAt } }
        } }`,
        { id: identifier },
      ).catch((e) => {
        if (/not found|Entity not found/i.test(e.message)) return { issue: null };
        throw e;
      });
      const i = data.issue;
      if (!i) return null;
      return {
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        url: i.url,
        state: i.state,
        team: { id: i.team.id, states: i.team.states.nodes },
        projectId: i.project?.id ?? null,
        comments: i.comments.nodes,
      };
    },

    /** @returns {Promise<string>} the comment's URL */
    async comment(issueId, body) {
      const data = await call(
        `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { url } } }`,
        { input: { issueId, body } },
      );
      return data.commentCreate.comment.url;
    },

    async move(issueId, stateId) {
      await call(
        `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
        { id: issueId, input: { stateId } },
      );
    },

    /**
     * Creates a finding's ticket.
     * @returns {Promise<{ id: string, identifier: string }>}
     */
    async createFinding({ teamId, projectId, stateId, title, description }) {
      const data = await call(
        `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }`,
        { input: { teamId, title, description, stateId, ...(projectId ? { projectId } : {}) } },
      );
      return data.issueCreate.issue;
    },

    /** Relates a finding's ticket to the rung's. */
    async relate(issueId, relatedIssueId) {
      await call(
        `mutation($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`,
        { input: { issueId, relatedIssueId, type: 'related' } },
      );
    },

    /**
     * Asks Linear where to put a file.
     * @returns {Promise<{ uploadUrl: string, assetUrl: string, headers: { key: string, value: string }[] }>}
     */
    async uploadTarget({ contentType, filename, size }) {
      const data = await call(
        `mutation($contentType: String!, $filename: String!, $size: Int!) {
          fileUpload(contentType: $contentType, filename: $filename, size: $size) {
            success uploadFile { uploadUrl assetUrl headers { key value } }
          } }`,
        { contentType, filename, size },
      );
      return data.fileUpload.uploadFile;
    },
  };
}

/**
 * Streams a body to the upload URL Linear gave, as Linear's upload guide does.
 * @param {{ uploadUrl: string, headers: { key: string, value: string }[] }} target
 * @param {{ contentType: string, size: number }} file
 * @param {import('node:stream').Readable} body
 * @returns {Promise<void>}
 */
export function putUpload(target, file, body) {
  return new Promise((resolve, reject) => {
    const headers = {
      'content-type': file.contentType,
      'content-length': String(file.size),
      'cache-control': 'public, max-age=31536000',
    };
    for (const h of target.headers) headers[h.key] = h.value;
    const req = request(target.uploadUrl, { method: 'PUT', headers }, (res) => {
      res.resume();
      res.on('end', () =>
        res.statusCode && res.statusCode < 300
          ? resolve()
          : reject(new Error(`the upload was refused: HTTP ${res.statusCode}`)),
      );
    });
    req.on('error', reject);
    body.on('error', (e) => req.destroy(e));
    body.pipe(req);
  });
}
