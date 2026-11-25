"use strict";

module.exports = async function getSecurityEvidence({ github, context, infrastructure = false }) {
  const fs = require('fs');
  const { evaluateCodeqlResults } = require('./evaluate-codeql-results');
  const { owner, repo } = context.repo;
  const pull = context.payload.pull_request;

  const checkRuns = await github.paginate(github.rest.checks.listForRef, {
    owner,
    repo,
    ref: pull.head.sha,
    per_page: 100,
  });
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pull.number,
    per_page: 100,
  });
  const sensitivePaths = infrastructure
    ? /(^app-release\/|^scripts\/|^nginx\/|compose\.ya?ml$|^\.github\/|pyproject\.toml|uv\.lock|requirements|package|Dockerfile|auth|token|secret|password)/i
    : /(^backend\/authentication\/|\/permissions?\.py$|\/settings\.py$|\/urls\.py$|(?:requirements\.txt|pyproject\.toml|uv\.lock)$|package-lock\.json$|package\.json$|^\.github\/(?:workflows|actions|scripts|tests)\/|^deploy\/|Dockerfile|nginx|auth|csrf|cors|token|secret|password)/i;
  const securitySensitiveFiles = files
    .map((file) => file.filename)
    .filter((filename) => sensitivePaths.test(filename));

  const securityChecks = checkRuns
    .filter((check) => /gitleaks|secret scan|malware|vulnerab|dependency|codeql|security/i.test(check.name || ''))
    .map((check) => ({
      id: check.id,
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      output: check.output?.summary || '',
    }));

  const defaultBranch = context.payload.repository.default_branch;
  let defaultBranchAnalyses = [];
  let baselineQueryError = '';
  try {
    defaultBranchAnalyses = await github.paginate(
      github.rest.codeScanning.listRecentAnalyses,
      {
        owner,
        repo,
        ref: `refs/heads/${defaultBranch}`,
        tool_name: 'CodeQL',
        per_page: 100,
      },
    );
  } catch (error) {
    baselineQueryError = error.message;
  }

  const codeqlInterpretation = evaluateCodeqlResults({
    upstreamResult: process.env.CODEQL_RESULT,
    scopeStatus: process.env.CODEQL_SCOPE_STATUS,
    scope: {
      python: process.env.CODEQL_SCOPE_PYTHON,
      javascript: process.env.CODEQL_SCOPE_JAVASCRIPT,
      actions: process.env.CODEQL_SCOPE_ACTIONS,
    },
    checkRuns,
    defaultBranch,
    defaultBranchAnalyses,
    baselineQueryError,
  });

  const securityAnnotations = [];
  for (const check of securityChecks) {
    try {
      const annotations = await github.paginate(github.rest.checks.listAnnotations, {
        owner,
        repo,
        check_run_id: check.id,
        per_page: 100,
      });
      securityAnnotations.push(...annotations.map((annotation) => ({
        check: check.name,
        path: annotation.path,
        start_line: annotation.start_line,
        end_line: annotation.end_line,
        annotation_level: annotation.annotation_level,
        title: annotation.title,
        message: annotation.message,
        raw_details: annotation.raw_details,
      })));
    } catch (error) {
      securityAnnotations.push({
        check: check.name,
        collection_error: error.message,
      });
    }
  }

  const evidence = {
    pull_request: {
      number: pull.number,
      title: pull.title,
      author: pull.user?.login,
      head_sha: pull.head.sha,
    },
    upstream_gates: {
      codeql: process.env.CODEQL_RESULT,
      dependency_vulnerability: process.env.DEPENDENCY_VULNERABILITY_RESULT,
      ...(!infrastructure && process.env.DEPENDENCY_MALWARE_RESULT !== undefined && { dependency_malware: process.env.DEPENDENCY_MALWARE_RESULT }),
      secret_scan: process.env.SECRET_SCAN_RESULT,
    },
    codeql_interpretation: codeqlInterpretation,
    gate_reports: {
      dependency_vulnerability: process.env.DEPENDENCY_VULNERABILITY_REPORT || '',
      ...(!infrastructure && process.env.DEPENDENCY_MALWARE_RESULT !== undefined && { dependency_malware: process.env.DEPENDENCY_MALWARE_REPORT || '' }),
    },
    security_sensitive_files: securitySensitiveFiles,
    security_checks: securityChecks,
    security_annotations: securityAnnotations,
  };

  fs.writeFileSync(`${process.env.RUNNER_TEMP}/security-evidence.json`, JSON.stringify(evidence, null, 2));
};
